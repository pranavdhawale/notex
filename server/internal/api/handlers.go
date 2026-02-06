package api

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"github.com/pranavdhawale/notex/server/internal/ws"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type CreateRoomRequest struct {
	SlugPrefix string `json:"slugPrefix"`
	Owner      string `json:"owner"`
}


// Helper to calculate expiration based on content
func calculateExpiry(hasContent bool) time.Time {
	if hasContent {
		return time.Now().Add(2 * time.Minute) // 2 Minutes for testing
	}
	return time.Now().Add(1 * time.Minute) // 1 Minute for testing
}

func CreateRoom(c *gin.Context) {
	var req CreateRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Generate slug: prefix + random suffix
	suffix := uuid.New().String()[:8]
	slug := req.SlugPrefix + "-" + suffix
	if req.SlugPrefix == "" {
		slug = "room-" + suffix
	}

	room := models.Room{
		Slug:      slug,
		Owner:     req.Owner,
		CreatedAt: time.Now(),
		ExpireAt:  calculateExpiry(false), // Initially empty, expires in 24h
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := collection.InsertOne(ctx, room)
	if err != nil {
		log.Printf("Failed to insert room: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
		return
	}

	c.JSON(http.StatusCreated, room)
}

func GetRoom(c *gin.Context) {
	slug := c.Param("room")

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var room models.Room
	err := collection.FindOne(ctx, bson.M{"slug": slug}).Decode(&room)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Refresh Expiration (Smart TTL)
	hasContent := false
	if room.Content != nil {
		// Check if content is empty string if it's a string, or just nil check
		// Currently Content is interface{}, usually string(base64) or map
		// Let's assume non-nil means content for now, or check empty string
		if s, ok := room.Content.(string); ok && s != "" {
			hasContent = true
		} else if room.Content != nil {
			hasContent = true // Non-string content
		}
	}
	
	newExpiry := calculateExpiry(hasContent)
	// Update ExpireAt in background (don't block read)
	go func(s string, t time.Time) {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer bgCancel()
		_, _ = collection.UpdateOne(bgCtx, bson.M{"slug": s}, bson.M{"$set": bson.M{"expire_at": t}})
	}(slug, newExpiry)

	c.JSON(http.StatusOK, room)
}

func DeleteRoom(c *gin.Context) {
	slug := c.Param("room")

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Delete Room Metadata
	// We ignore if it wasn't found, because we want to clean up files anyway.
	_, err := collection.DeleteOne(ctx, bson.M{"slug": slug})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// 2. Delete Associated Files
	fileCollection := state.MongoDatabase.Collection("files")
	_, _ = fileCollection.DeleteMany(ctx, bson.M{"room_id": slug})

	// 3. Cleanup Disk (Uploads)
	_ = os.RemoveAll("uploads/" + slug)

	// 4. Close WebSocket Connections
	ws.MainHub.CloseRoom(slug)

	c.JSON(http.StatusOK, gin.H{"message": "Room deleted"})
}

type SaveRoomRequest struct {
	Content interface{} `json:"content"`
}

func SaveRoom(c *gin.Context) {
	slug := c.Param("room")
	var req SaveRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Use Upsert: true so ad-hoc rooms (like demo-room) are created on save
	opts := options.Update().SetUpsert(true)
	filter := bson.M{"slug": slug}
	
	// Saving implies content exists -> 7 Days TTL
	newExpiry := calculateExpiry(true)
	
	update := bson.M{
		"$set": bson.M{
			"content":   req.Content,
			"expire_at": newExpiry,
		},
		"$setOnInsert": bson.M{
			"created_at": time.Now(),
			"owner":      "anon_save", // Fallback owner
		},
	}

	_, err := collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save room"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Room saved"})
}
