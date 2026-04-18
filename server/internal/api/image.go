package api

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
)

// contentTypeForExt maps common image extensions to MIME types.
// Falls back to application/octet-stream for unknown extensions.
func contentTypeForExt(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

// ServeImage streams a file attachment inline as an image (for rendering in <img> tags).
// Note: Despite the name, this serves from the "files" collection, not "images".
// It is used when a file attachment happens to be an image and needs to be rendered inline.
// Unlike DownloadFile, this sets Content-Type to the actual image type
// and does NOT set Content-Disposition: attachment.
func ServeImage(c *gin.Context) {
	roomID := c.Param("room")
	fileID := c.Param("fileId")

	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var file struct {
		ID         string `bson:"_id"`
		RoomID     string `bson:"room_id"`
		Name       string `bson:"name"`
		Size       int64  `bson:"size"`
		StorageKey string `bson:"storage_key"`
	}
	err := collection.FindOne(ctx, bson.M{"_id": fileID, "room_id": roomID}).Decode(&file)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Security: Reconstruct storageKey from verified components (same as DownloadFile)
	ext := filepath.Ext(file.Name)
	reconstructedKey := fmt.Sprintf("%s/%s%s", roomID, file.ID, ext)

	if reconstructedKey != file.StorageKey {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "File integrity check failed"})
		return
	}

	// Stream from MinIO
	downloadCtx, downloadCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer downloadCancel()

	reader, err := state.MinIOClient.Download(downloadCtx, reconstructedKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File content missing"})
		return
	}
	defer reader.Close()

	// Determine content type from file extension
	contentType := contentTypeForExt(ext)

	// Security headers — inline rendering, not attachment download
	c.Header("Content-Type", contentType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Frame-Options", "DENY")
	c.Header("Cache-Control", "private, max-age=3600")

	c.DataFromReader(http.StatusOK, file.Size, contentType, reader, nil)
}