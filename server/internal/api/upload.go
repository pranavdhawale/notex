package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const MaxFileSize = 200 * 1024 * 1024 // 200MB
const MaxFilenameLength = 50          // Maximum filename length

// sanitizeFilename removes dangerous characters from filename for safe header usage
func sanitizeFilename(name string) string {
	// Remove control characters, quotes, backslashes, and newlines
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return '_'
		}
		return r
	}, name)

	// Limit length
	if len(name) > MaxFilenameLength {
		ext := filepath.Ext(name)
		base := name[:MaxFilenameLength-len(ext)]
		name = base + ext
	}

	return name
}

func UploadFile(c *gin.Context) {
	roomID := c.Param("room")

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	if file.Size > MaxFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File exceeds 200MB limit"})
		return
	}

	// Validate filename length
	if len(file.Filename) > MaxFilenameLength {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Filename too long. Maximum %d characters.", MaxFilenameLength),
		})
		return
	}

	if file.Filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Filename cannot be empty"})
		return
	}

	// Generate unique ID and storage key
	ext := filepath.Ext(file.Filename)
	uniqueId := uuid.New().String()
	storageKey := fmt.Sprintf("%s/%s%s", roomID, uniqueId, ext)

	// Open the uploaded file
	fileHandle, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}
	defer fileHandle.Close()

	// Upload to MinIO
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	err = state.MinIOClient.Upload(ctx, storageKey, fileHandle, file.Size, "application/octet-stream")
	if err != nil {
		log.Printf("MinIO upload error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file"})
		return
	}

	// Create File Record
	fileRecord := models.File{
		ID:         uniqueId,
		RoomID:     roomID,
		UploaderID: c.GetString("userID"),
		Name:       file.Filename,
		Size:       file.Size,
		StorageKey: storageKey,
		CreatedAt:  time.Now(),
	}

	// Save to Mongo
	collection := state.MongoDatabase.Collection("files")
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()

	_, err = collection.InsertOne(ctx2, fileRecord)
	if err != nil {
		// Try to cleanup MinIO on database failure
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		state.MinIOClient.Delete(cleanupCtx, storageKey)
		cleanupCancel()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Construct download URL
	fileRecord.URL = fmt.Sprintf("/api/rooms/%s/files/%s/download", roomID, uniqueId)

	c.JSON(http.StatusCreated, fileRecord)
}

// ListFiles returns all files for a room
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
	for i := range files {
		files[i].URL = fmt.Sprintf("/api/rooms/%s/files/%s/download", roomID, files[i].ID)
	}

	c.JSON(http.StatusOK, files)
}

// DownloadFile streams a file from MinIO to the client
func DownloadFile(c *gin.Context) {
	roomID := c.Param("room")
	fileID := c.Param("fileId")

	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var file models.File
	err := collection.FindOne(ctx, bson.M{"_id": fileID, "room_id": roomID}).Decode(&file)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Stream from MinIO
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel2()

	reader, err := state.MinIOClient.Download(ctx2, file.StorageKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File content missing"})
		return
	}
	defer reader.Close()

	// Security headers
	c.Header("Content-Type", "application/octet-stream")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Frame-Options", "DENY")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", sanitizeFilename(file.Name)))
	c.Header("Cache-Control", "private, max-age=3600")

	// Stream to client
	c.DataFromReader(http.StatusOK, file.Size, "application/octet-stream", reader, nil)
}

// DeleteFile removes a file from MinIO and MongoDB
func DeleteFile(c *gin.Context) {
	roomID := c.Param("room")
	fileID := c.Param("fileId")
	requestorID := c.GetString("userID")

	if requestorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Authentication required"})
		return
	}

	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Fetch File Metadata
	var file models.File
	err := collection.FindOne(ctx, bson.M{"_id": fileID, "room_id": roomID}).Decode(&file)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Check Permissions
	canDelete := false
	if file.UploaderID != "" && file.UploaderID == requestorID {
		canDelete = true
	} else {
		// Check if requestor is Room Owner
		roomCollection := state.MongoDatabase.Collection("rooms")
		var room models.Room
		err := roomCollection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
		if err == nil && room.Owner == requestorID {
			canDelete = true
		}
	}

	if !canDelete {
		c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
		return
	}

	// Delete from DB first (auth check done)
	_, err = collection.DeleteOne(ctx, bson.M{"_id": fileID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Delete from MinIO (best effort)
	ctx2, cancel2 := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel2()
	if err := state.MinIOClient.Delete(ctx2, file.StorageKey); err != nil {
		log.Printf("Warning: failed to delete from MinIO: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"message": "File deleted"})
}

// DeleteAllFiles removes multiple files from MinIO and MongoDB
func DeleteAllFiles(c *gin.Context) {
	roomID := c.Param("room")
	requestorID := c.GetString("userID")
	targetUser := c.Query("user")

	if requestorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Authentication required"})
		return
	}

	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Determine Filter
	filter := bson.M{"room_id": roomID}

	// Check Permissions
	roomCollection := state.MongoDatabase.Collection("rooms")
	var room models.Room
	err := roomCollection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if targetUser == "me" {
		filter["uploader_id"] = requestorID
	} else {
		if room.Owner != requestorID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Only room owner can delete all files"})
			return
		}
	}

	// Find files to delete - project only storage_key to minimize memory
	opts := options.Find().SetProjection(bson.M{"storage_key": 1})
	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer cursor.Close(ctx)

	// Collect storage keys for MinIO deletion
	var storageKeys []string
	for cursor.Next(ctx) {
		var file models.File
		if err := cursor.Decode(&file); err != nil {
			log.Printf("Error: failed to decode file document for deletion: %v", err)
			continue
		}
		storageKeys = append(storageKeys, file.StorageKey)
	}

	if err := cursor.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error during file scan"})
		return
	}

	if len(storageKeys) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No files to delete", "count": 0})
		return
	}

	// Delete from DB (single operation)
	_, err = collection.DeleteMany(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete from database"})
		return
	}

	// Delete from MinIO (best effort)
	ctx2, cancel2 := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel2()

	deletedCount := 0
	for _, key := range storageKeys {
		if err := state.MinIOClient.Delete(ctx2, key); err == nil {
			deletedCount++
		} else {
			log.Printf("Warning: failed to delete %s from MinIO: %v", key, err)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Files deleted",
		"count":   deletedCount,
	})
}