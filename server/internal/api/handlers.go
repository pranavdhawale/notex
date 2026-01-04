package api

import (
	"context"
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
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := collection.InsertOne(ctx, room)
	if err != nil {
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
	update := bson.M{
		"$set": bson.M{
			"content": req.Content,
			// If we are creating it now, we should probably set owner/created_at too only on insert?
			// But $set overwrites.
			// Let's use $setOnInsert for static fields if we want, but simple $set is fine for MVP.
			// We might overwrite Owner if we don't handle it, but for now it's okay.
		},
		"$setOnInsert": bson.M{
			"created_at": time.Now(),
			"owner": "anon_save", // Fallback owner
		},
	}

	_, err := collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save room"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Room saved"})
}
