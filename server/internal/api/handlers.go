package api

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"github.com/pranavdhawale/notex/server/internal/utils"
	"github.com/pranavdhawale/notex/server/internal/ws"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type CreateRoomRequest struct {
	Owner      string  `json:"owner"`
	CustomSlug *string `json:"customSlug,omitempty"` // Optional custom slug
}

// calculateExpiry returns the expiration time based on whether the room has content.
// - Empty rooms (no document content): 24 hours
// - Rooms with content: 7 days
// Files inherit the room's TTL and are updated when room TTL is refreshed.
func calculateExpiry(hasContent bool) time.Time {
	if hasContent {
		return time.Now().Add(7 * 24 * time.Hour) // 7 Days
	}
	return time.Now().Add(24 * time.Hour) // 1 Day
}

func CreateRoom(c *gin.Context) {
	var req CreateRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var slug string
	var err error

	// If user provided custom slug, validate and use it
	if req.CustomSlug != nil && *req.CustomSlug != "" {
		customSlug := strings.ToLower(strings.TrimSpace(*req.CustomSlug))

		// Validate format
		if err := utils.ValidateCustomSlug(customSlug); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Check if already exists
		count, err := collection.CountDocuments(ctx, bson.M{"slug": customSlug})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check slug availability"})
			return
		}

		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "Room slug already taken"})
			return
		}

		slug = customSlug
	} else {
		// Auto-generate 2-word slug
		slug, err = utils.GenerateUniqueSlug(ctx, collection)
		if err != nil {
			log.Printf("Failed to generate unique slug: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
			return
		}
	}

	room := models.Room{
		Slug:      slug,
		Owner:     req.Owner,
		CreatedAt: time.Now(),
		ExpireAt:  calculateExpiry(false), // Initially empty, expires in 24h
	}

	_, err = collection.InsertOne(ctx, room)
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
	hasContent := room.Content != nil

	newExpiry := calculateExpiry(hasContent)
	// Update ExpireAt in background (don't block read)
	go func(s string, t time.Time) {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer bgCancel()
		_, err := collection.UpdateOne(bgCtx, bson.M{"slug": s}, bson.M{"$set": bson.M{"expire_at": t}})
		if err != nil {
			log.Printf("Failed to update room expiry for %s: %v", s, err)
		}

		// Also update file TTL to match room TTL
		if err := state.UpdateFilesTTL(s, t); err != nil {
			log.Printf("Failed to update file TTL for room %s: %v", s, err)
		}
	}(slug, newExpiry)

	c.JSON(http.StatusOK, room)
}

func DeleteRoom(c *gin.Context) {
	slug := c.Param("room")
	requestorID := c.GetString("userID")

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// First check if room exists and user is owner
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

	// Authorization check
	if room.Owner != requestorID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only room owner can delete this room"})
		return
	}

	// 1. Delete from MinIO first (before any metadata changes)
	// Use DeleteByPrefix to remove all files in the room's folder
	cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cleanupCancel()
	if err := state.MinIOClient.DeleteByPrefix(cleanupCtx, slug+"/"); err != nil {
		log.Printf("Warning: failed to delete MinIO files for room %s: %v", slug, err)
		// Continue with deletion even if MinIO cleanup fails - we can clean up orphaned files later
	}

	// 2. Delete Room Metadata
	_, err = collection.DeleteOne(ctx, bson.M{"slug": slug})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// 3. Delete File Metadata
	fileCollection := state.MongoDatabase.Collection("files")
	_, _ = fileCollection.DeleteMany(ctx, bson.M{"room_id": slug})

	// 4. Close WebSocket Connections
	ws.MainHub.CloseRoom(slug)

	// 5. Purge all auth tokens for this room
	state.AuthTokens.DeleteAllForRoom(slug)

	c.JSON(http.StatusOK, gin.H{"message": "Room deleted"})
}

type SaveRoomRequest struct {
	Content interface{} `json:"content"`
}

// Max content size for room saves (10MB)
const MaxContentSize = 10 * 1024 * 1024

func SaveRoom(c *gin.Context) {
	slug := c.Param("room")

	// Limit request body size
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, int64(MaxContentSize))

	var req SaveRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Validate content is not nil
	if req.Content == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Content is required"})
		return
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Use Upsert: false to prevent creating rooms on save if they don't exist
	opts := options.Update().SetUpsert(false)
	filter := bson.M{"slug": slug}

	// Saving implies content exists -> 7 Days TTL
	newExpiry := calculateExpiry(true)

	update := bson.M{
		"$set": bson.M{
			"content":   req.Content,
			"expire_at": newExpiry,
		},
	}

	result, err := collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save room"})
		return
	}

	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Update file TTL to match room TTL
	if err := state.UpdateFilesTTL(slug, newExpiry); err != nil {
		log.Printf("Failed to update file TTL for room %s: %v", slug, err)
		// Don't fail the request - files can still be cleaned up
	}

	c.JSON(http.StatusOK, gin.H{"message": "Room saved"})
}
