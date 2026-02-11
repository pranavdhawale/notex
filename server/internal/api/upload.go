package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
)

const MaxFileSize = 200 * 1024 * 1024 // 200MB

func UploadFile(c *gin.Context) {
	roomID := c.Param("room")
	roomParam := c.Param("room") // slug acts as room ID
	
	// Validate room exists? For V1 speed, we assume slug is valid or create folder on fly.
	// We'll trust the path param.
	
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	if file.Size > MaxFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File exceeds 200MB limit"})
		return
	}

	// Create uploads directory for room
	uploadDir := fmt.Sprintf("uploads/%s", roomParam)
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Save file with unique ID
	ext := filepath.Ext(file.Filename)
	uniqueId := uuid.New().String()
	storedFilename := fmt.Sprintf("%s%s", uniqueId, ext)
	dst := filepath.Join(uploadDir, storedFilename)

	if err := c.SaveUploadedFile(file, dst); err != nil {
		os.Remove(dst) // Ensure partial file is cleaned up
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Create File Record
	fileRecord := models.File{
		ID:        uniqueId,
		RoomID:    roomID, // using slug as ID for now
		UploaderID: c.GetHeader("X-User-ID"), // Capture from header
		Name:      file.Filename,
		Size:      file.Size,
		Path:      dst,
		CreatedAt: time.Now(),
	}

	// Save to Mongo
	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = collection.InsertOne(ctx, fileRecord)
	if err != nil {
		os.Remove(dst) // Cleanup
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Construct public URL
	fileRecord.URL = fmt.Sprintf("/uploads/%s/%s", roomParam, storedFilename)

	c.JSON(http.StatusCreated, fileRecord)
}

// ListFiles - helper to get files for a room
func ListFiles(c *gin.Context) {
	roomID := c.Param("room")
	
	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()


	cursor, err := collection.Find(ctx, bson.M{"room_id": roomID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer cursor.Close(ctx)

	var files []models.File
	if err = cursor.All(ctx, &files); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode files"})
		return
	}

	// Enrich with URLs
	for i, f := range files {
		// filename is derived from Path
		_, fname := filepath.Split(f.Path)
		files[i].URL = fmt.Sprintf("/uploads/%s/%s", f.RoomID, fname)
	}

	c.JSON(http.StatusOK, files)
}

func DeleteFile(c *gin.Context) {
	roomID := c.Param("room")
	fileID := c.Param("fileId")
	requestorID := c.GetHeader("X-User-ID")

	if requestorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing User ID header"})
		return
	}

	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Fetch File Metadata
	var file models.File
	err := collection.FindOne(ctx, bson.M{"_id": fileID, "room_id": roomID}).Decode(&file)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// 2. Check Permissions
	canDelete := false
	if file.UploaderID != "" && file.UploaderID == requestorID {
		canDelete = true
	} else {
		// Check if requestor is Room Owner
		roomCollection := state.MongoDatabase.Collection("rooms")
		var room models.Room
		err := roomCollection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
		
		fmt.Printf("DEBUG DELETE: FileID=%s Requestor=%s Uploader=%s RoomOwner=%s (Error=%v)\n", 
			fileID, requestorID, file.UploaderID, room.Owner, err)

		if err == nil && room.Owner == requestorID {
			canDelete = true
		}
	}

	if !canDelete {
		c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
		return
	}

	// 3. Delete from DB
	_, err = collection.DeleteOne(ctx, bson.M{"_id": fileID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// 4. Delete from Disk
	os.Remove(file.Path)

	c.JSON(http.StatusOK, gin.H{"message": "File deleted"})
}
