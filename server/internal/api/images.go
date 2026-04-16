package api

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const MaxImageSize = 10 * 1024 * 1024 // 10MB for images
const ThumbnailSize = 300             // Max width/height for thumbnails (300px)

var allowedImageTypes = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
}

// isAllowedImageType checks if the file extension is an allowed image type
func isAllowedImageType(ext string) bool {
	return allowedImageTypes[strings.ToLower(ext)]
}

// generateThumbnail creates a thumbnail from the original image
// Returns the thumbnail bytes, dimensions, and error
func generateThumbnail(img image.Image, ext string) ([]byte, int, int, error) {
	// Calculate thumbnail dimensions maintaining aspect ratio
	origBounds := img.Bounds()
	origWidth := origBounds.Dx()
	origHeight := origBounds.Dy()

	var thumbWidth, thumbHeight int
	if origWidth > origHeight {
		thumbWidth = ThumbnailSize
		thumbHeight = (origHeight * ThumbnailSize) / origWidth
	} else {
		thumbHeight = ThumbnailSize
		thumbWidth = (origWidth * ThumbnailSize) / origHeight
	}

	// Ensure minimum size of 1
	if thumbWidth < 1 {
		thumbWidth = 1
	}
	if thumbHeight < 1 {
		thumbHeight = 1
	}

	// Use simple scaling - draw.Src for fast nearest-neighbor scaling
	thumbnail := image.NewRGBA(image.Rect(0, 0, thumbWidth, thumbHeight))
	for y := 0; y < thumbHeight; y++ {
		for x := 0; x < thumbWidth; x++ {
			// Map thumbnail pixel to original image pixel
			origX := (x * origWidth) / thumbWidth
			origY := (y * origHeight) / thumbHeight
			thumbnail.Set(x, y, img.At(origX+origBounds.Min.X, origY+origBounds.Min.Y))
		}
	}

	// Encode thumbnail to bytes based on original format
	var buf bytes.Buffer
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		err := jpeg.Encode(&buf, thumbnail, &jpeg.Options{Quality: 85})
		return buf.Bytes(), thumbWidth, thumbHeight, err
	case ".png":
		err := png.Encode(&buf, thumbnail)
		return buf.Bytes(), thumbWidth, thumbHeight, err
	case ".gif":
		err := gif.Encode(&buf, thumbnail, nil)
		return buf.Bytes(), thumbWidth, thumbHeight, err
	case ".webp":
		// For WebP, encode as PNG (browser will display fine)
		err := png.Encode(&buf, thumbnail)
		return buf.Bytes(), thumbWidth, thumbHeight, err
	default:
		err := jpeg.Encode(&buf, thumbnail, &jpeg.Options{Quality: 85})
		return buf.Bytes(), thumbWidth, thumbHeight, err
	}
}

// decodeImage decodes an image from bytes based on extension
func decodeImage(data []byte, ext string) (image.Image, error) {
	reader := bytes.NewReader(data)
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return jpeg.Decode(reader)
	case ".png":
		return png.Decode(reader)
	case ".gif":
		return gif.Decode(reader)
	default:
		// Try generic decode
		img, _, err := image.Decode(reader)
		return img, err
	}
}

// UploadImage handles POST /api/rooms/:room/images
func UploadImage(c *gin.Context) {
	roomID := c.Param("room")

	// Check if room exists and get its expiration time
	roomCollection := state.MongoDatabase.Collection("rooms")
	roomCtx, roomCancel := context.WithTimeout(context.Background(), 5*time.Second)
	var room models.Room
	err := roomCollection.FindOne(roomCtx, bson.M{"slug": roomID}).Decode(&room)
	roomCancel()

	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No image uploaded"})
		return
	}

	// Validate file size (max 10MB)
	if file.Size > MaxImageSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Image exceeds 10MB limit"})
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

	// Validate file type
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !isAllowedImageType(ext) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid file type. Allowed types: jpeg, png, gif, webp",
		})
		return
	}

	// Generate unique ID and storage key
	imageID := uuid.New().String()
	storageKey := fmt.Sprintf("%s/%s%s", roomID, imageID, ext)
	thumbnailKey := fmt.Sprintf("%s/%s_thumb%s", roomID, imageID, ext)

	// Open the uploaded file
	fileHandle, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read image"})
		return
	}
	defer fileHandle.Close()

	// Read file content into memory for processing
	fileData, err := io.ReadAll(fileHandle)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read image data"})
		return
	}

	// Determine content type
	contentType := contentTypeForExt(ext)

	// Decode image and generate thumbnail
	var thumbData []byte

	img, decodeErr := decodeImage(fileData, ext)
	if decodeErr != nil {
		// If we can't decode, proceed without thumbnail (still store original)
		log.Printf("Warning: could not decode image for thumbnail: %v", decodeErr)
		thumbData = nil
	} else {
		// Generate thumbnail
		var err error
		thumbData, _, _, err = generateThumbnail(img, ext)
		if err != nil {
			log.Printf("Warning: could not generate thumbnail: %v", err)
			thumbData = nil
		}
	}

	// Upload context
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Upload original image to MinIO
	err = state.MinIOClient.Upload(ctx, storageKey, bytes.NewReader(fileData), int64(len(fileData)), contentType)
	if err != nil {
		log.Printf("MinIO upload error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload image"})
		return
	}

	// Upload thumbnail to MinIO (if generated)
	if thumbData != nil {
		thumbContentType := contentType
		// WebP thumbnails are stored as PNG
		if strings.ToLower(ext) == ".webp" {
			thumbContentType = "image/png"
		}
		err = state.MinIOClient.Upload(ctx, thumbnailKey, bytes.NewReader(thumbData), int64(len(thumbData)), thumbContentType)
		if err != nil {
			log.Printf("Warning: failed to upload thumbnail: %v", err)
			// Don't fail the request, just log the error
		}
	}

	// Create Image record with ref_count = 0
	imageRecord := models.Image{
		ID:           imageID,
		RoomID:       roomID,
		UploaderID:   c.GetString("userID"),
		Name:         file.Filename,
		Size:         file.Size,
		Width:        0, // Will be updated if we decode
		Height:       0,
		StorageKey:   storageKey,
		ThumbnailKey: thumbnailKey,
		RefCount:     0,
		LastUsedAt:   time.Now(),
		CreatedAt:    time.Now(),
		ExpireAt:     room.ExpireAt, // Inherit TTL from room
	}

	// Update dimensions if we decoded the image
	if img != nil {
		bounds := img.Bounds()
		imageRecord.Width = bounds.Dx()
		imageRecord.Height = bounds.Dy()
	}

	// Save to MongoDB
	collection := state.MongoDatabase.Collection("images")
	dbCtx, dbCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer dbCancel()

	_, err = collection.InsertOne(dbCtx, imageRecord)
	if err != nil {
		// Try to cleanup MinIO on database failure
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if cleanupErr := state.MinIOClient.Delete(cleanupCtx, storageKey); cleanupErr != nil {
			log.Printf("Warning: failed to cleanup MinIO file %s after DB error: %v", storageKey, cleanupErr)
		}
		if thumbData != nil {
			if cleanupErr := state.MinIOClient.Delete(cleanupCtx, thumbnailKey); cleanupErr != nil {
				log.Printf("Warning: failed to cleanup thumbnail %s after DB error: %v", thumbnailKey, cleanupErr)
			}
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Construct URLs for image serving
	imageRecord.URL = fmt.Sprintf("/api/rooms/%s/images/%s/raw", roomID, imageID)
	imageRecord.ThumbnailURL = fmt.Sprintf("/api/rooms/%s/images/%s/thumbnail", roomID, imageID)

	c.JSON(http.StatusCreated, imageRecord)
}

// ListImages handles GET /api/rooms/:room/images
func ListImages(c *gin.Context) {
	roomID := c.Param("room")

	// Parse pagination parameters
	limit := DefaultPageSize
	offset := 0

	if l := c.Query("limit"); l != "" {
		if parsedLimit, err := strconv.Atoi(l); err == nil && parsedLimit > 0 {
			if parsedLimit > MaxPageSize {
				limit = MaxPageSize
			} else {
				limit = parsedLimit
			}
		}
	}

	if o := c.Query("offset"); o != "" {
		if parsedOffset, err := strconv.Atoi(o); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get total count for pagination metadata
	totalCount, err := collection.CountDocuments(ctx, bson.M{"room_id": roomID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Query with pagination
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64(offset)).
		SetLimit(int64(limit))

	cursor, err := collection.Find(ctx, bson.M{"room_id": roomID}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer cursor.Close(ctx)

	var images []models.Image
	if err = cursor.All(ctx, &images); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode images"})
		return
	}

	// Enrich with URLs
	for i := range images {
		images[i].URL = fmt.Sprintf("/api/rooms/%s/images/%s/raw", roomID, images[i].ID)
		images[i].ThumbnailURL = fmt.Sprintf("/api/rooms/%s/images/%s/thumbnail", roomID, images[i].ID)
	}

	// Return paginated response
	c.JSON(http.StatusOK, gin.H{
		"images": images,
		"pagination": gin.H{
			"total":   totalCount,
			"limit":   limit,
			"offset":  offset,
			"hasMore": offset+len(images) < int(totalCount),
		},
	})
}

// GetImageRaw handles GET /api/rooms/:room/images/:id/raw
func GetImageRaw(c *gin.Context) {
	roomID := c.Param("room")
	imageID := c.Param("id")

	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var image models.Image
	err := collection.FindOne(ctx, bson.M{"_id": imageID, "room_id": roomID}).Decode(&image)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}

	// Security: Reconstruct storageKey from verified components
	ext := filepath.Ext(image.Name)
	reconstructedKey := fmt.Sprintf("%s/%s%s", roomID, image.ID, ext)

	// Verify the reconstructed key matches the stored key (defense in depth)
	if reconstructedKey != image.StorageKey {
		log.Printf("Security warning: storageKey mismatch for image %s in room %s. Expected %s, got %s",
			imageID, roomID, reconstructedKey, image.StorageKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Image integrity check failed"})
		return
	}

	// Stream from MinIO
	downloadCtx, downloadCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer downloadCancel()

	reader, err := state.MinIOClient.Download(downloadCtx, reconstructedKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image content missing"})
		return
	}
	defer reader.Close()

	// Determine content type from file extension
	contentType := contentTypeForExt(ext)

	// Security headers for inline rendering
	c.Header("Content-Type", contentType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Frame-Options", "DENY")
	c.Header("Cache-Control", "private, max-age=3600")

	c.DataFromReader(http.StatusOK, image.Size, contentType, reader, nil)
}

// GetImageThumbnail handles GET /api/rooms/:room/images/:id/thumbnail
// Returns a smaller version of the image for gallery display
func GetImageThumbnail(c *gin.Context) {
	roomID := c.Param("room")
	imageID := c.Param("id")

	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var image models.Image
	err := collection.FindOne(ctx, bson.M{"_id": imageID, "room_id": roomID}).Decode(&image)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}

	// Determine extension and thumbnail key
	ext := filepath.Ext(image.Name)

	// If no thumbnail exists, fall back to full image
	thumbnailKey := image.ThumbnailKey
	if thumbnailKey == "" {
		// Legacy images without thumbnails - serve original
		thumbnailKey = image.StorageKey
	}

	// Security: Reconstruct key from verified components
	reconstructedKey := fmt.Sprintf("%s/%s_thumb%s", roomID, image.ID, ext)
	if thumbnailKey == image.StorageKey {
		// Fallback to original image
		reconstructedKey = image.StorageKey
	}

	// Verify the key matches
	if thumbnailKey != reconstructedKey && thumbnailKey != image.StorageKey {
		log.Printf("Security warning: thumbnailKey mismatch for image %s in room %s", imageID, roomID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Image integrity check failed"})
		return
	}

	// Stream from MinIO
	downloadCtx, downloadCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer downloadCancel()

	reader, err := state.MinIOClient.Download(downloadCtx, thumbnailKey)
	if err != nil {
		// If thumbnail doesn't exist, fall back to original
		reader, err = state.MinIOClient.Download(downloadCtx, image.StorageKey)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Image content missing"})
			return
		}
	}
	defer reader.Close()

	// Determine content type
	contentType := contentTypeForExt(ext)

	// Security headers for inline rendering
	c.Header("Content-Type", contentType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Frame-Options", "DENY")
	c.Header("Cache-Control", "private, max-age=86400") // Cache thumbnails for 24 hours

	c.DataFromReader(http.StatusOK, -1, contentType, reader, nil)
}

// DeleteImage handles DELETE /api/rooms/:room/images/:id
func DeleteImage(c *gin.Context) {
	roomID := c.Param("room")
	imageID := c.Param("id")
	requestorID := c.GetString("userID")

	if requestorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Authentication required"})
		return
	}

	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Fetch image metadata
	var image models.Image
	err := collection.FindOne(ctx, bson.M{"_id": imageID, "room_id": roomID}).Decode(&image)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}

	// Check permissions: uploader or room owner can delete
	canDelete := false
	if image.UploaderID != "" && image.UploaderID == requestorID {
		canDelete = true
	} else {
		// Check if requestor is room owner
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

	// Delete from DB first
	_, err = collection.DeleteOne(ctx, bson.M{"_id": imageID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Security: Reconstruct storageKey from verified components
	ext := filepath.Ext(image.Name)
	reconstructedKey := fmt.Sprintf("%s/%s%s", roomID, image.ID, ext)

	// Verify the reconstructed key matches the stored key (defense in depth)
	if reconstructedKey != image.StorageKey {
		log.Printf("Security warning: storageKey mismatch for image %s in room %s. Expected %s, got %s",
			imageID, roomID, reconstructedKey, image.StorageKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Image integrity check failed"})
		return
	}

	// Delete from MinIO (best effort)
	deleteCtx, deleteCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer deleteCancel()
	if err := state.MinIOClient.Delete(deleteCtx, reconstructedKey); err != nil {
		log.Printf("Warning: failed to delete from MinIO: %v", err)
	}
	// Also delete thumbnail if it exists
	if image.ThumbnailKey != "" {
		if err := state.MinIOClient.Delete(deleteCtx, image.ThumbnailKey); err != nil {
			log.Printf("Warning: failed to delete thumbnail from MinIO: %v", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Image deleted"})
}

// ReconcileImageRefsRequest represents the request body for ReconcileImageRefs
type ReconcileImageRefsRequest struct {
	ImageIDs []string `json:"imageIds" binding:"required"`
}

// ReconcileImageRefs handles POST /api/rooms/:room/images/reconcile
// Updates reference counts for images based on current usage in the document
func ReconcileImageRefs(c *gin.Context) {
	roomID := c.Param("room")

	var req ReconcileImageRefsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Convert imageIds list to a set for O(1) lookups
	imageIDSet := make(map[string]bool, len(req.ImageIDs))
	for _, id := range req.ImageIDs {
		imageIDSet[id] = true
	}

	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get all images for the room
	cursor, err := collection.Find(ctx, bson.M{"room_id": roomID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer cursor.Close(ctx)

	var images []models.Image
	if err = cursor.All(ctx, &images); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode images"})
		return
	}

	now := time.Now()
	var updatedCount int

	// Process each image
	for _, image := range images {
		inDocument := imageIDSet[image.ID]

		var update bson.M

		if inDocument && image.RefCount == 0 {
			// Image is in document but ref_count was 0 -> set to 1
			update = bson.M{
				"$set": bson.M{
					"ref_count":   1,
					"last_used_at": now,
				},
			}
		} else if inDocument && image.RefCount > 0 {
			// Image is in document and already has refs -> increment
			update = bson.M{
				"$inc": bson.M{"ref_count": 1},
				"$set": bson.M{"last_used_at": now},
			}
		} else if !inDocument && image.RefCount > 0 {
			// Image is not in document but has refs -> decrement
			update = bson.M{
				"$inc": bson.M{"ref_count": -1},
				"$set": bson.M{"last_used_at": now},
			}
		} else {
			// Image not in document and ref_count is 0 -> no change needed
			continue
		}

		_, err := collection.UpdateByID(ctx, image.ID, update)
		if err != nil {
			log.Printf("Warning: failed to update ref_count for image %s: %v", image.ID, err)
			continue
		}
		updatedCount++
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Image references reconciled",
		"updated": updatedCount,
	})
}

// CleanupUnusedImages handles POST /api/rooms/:room/images/cleanup
// Room owner only - deletes all images with ref_count = 0
func CleanupUnusedImages(c *gin.Context) {
	roomID := c.Param("room")
	requestorID := c.GetString("userID")

	if requestorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Authentication required"})
		return
	}

	// Check if requestor is room owner
	roomCollection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var room models.Room
	err := roomCollection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.Owner != requestorID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only room owner can cleanup unused images"})
		return
	}

	// Find all images with ref_count = 0
	collection := state.MongoDatabase.Collection("images")
	filter := bson.M{
		"room_id":   roomID,
		"ref_count": 0,
	}

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
		var image models.Image
		if err := cursor.Decode(&image); err != nil {
			log.Printf("Error: failed to decode image document for cleanup: %v", err)
			continue
		}
		storageKeys = append(storageKeys, image.StorageKey)
	}

	if err := cursor.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error during image scan"})
		return
	}

	if len(storageKeys) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No unused images to cleanup", "count": 0})
		return
	}

	// Delete from DB
	_, err = collection.DeleteMany(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete from database"})
		return
	}

	// Delete from MinIO using batch operation
	batchCtx, batchCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer batchCancel()

	if err := state.MinIOClient.DeleteBatch(batchCtx, storageKeys); err != nil {
		log.Printf("Warning: some MinIO deletions may have failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Unused images cleaned up",
		"count":   len(storageKeys),
	})
}

// SaveImageToFiles handles POST /api/rooms/:room/images/:id/save-to-files
// Copies an image to the files collection for persistent storage
func SaveImageToFiles(c *gin.Context) {
	roomID := c.Param("room")
	imageID := c.Param("id")

	// Get the image
	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var image models.Image
	err := collection.FindOne(ctx, bson.M{"_id": imageID, "room_id": roomID}).Decode(&image)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}

	// If this image was originally created from a file, return the original file
	// instead of creating a duplicate
	if image.SourceFileID != "" {
		fileCollection := state.MongoDatabase.Collection("files")
		var originalFile models.File
		err := fileCollection.FindOne(ctx, bson.M{"_id": image.SourceFileID, "room_id": roomID}).Decode(&originalFile)
		if err == nil {
			// Original file still exists, return it with duplicate flag
			originalFile.URL = fmt.Sprintf("/api/rooms/%s/files/%s/download", roomID, originalFile.ID)
			c.JSON(http.StatusOK, gin.H{
				"file":         originalFile,
				"isDuplicate": true,
			})
			return
		}
		// If original file not found, continue to create a new file (it may have been deleted)
	}

	// Get room for expiration
	roomCollection := state.MongoDatabase.Collection("rooms")
	var room models.Room
	err = roomCollection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Security: Reconstruct storageKey from verified components
	ext := filepath.Ext(image.Name)
	reconstructedKey := fmt.Sprintf("%s/%s%s", roomID, image.ID, ext)

	// Verify the reconstructed key matches the stored key (defense in depth)
	if reconstructedKey != image.StorageKey {
		log.Printf("Security warning: storageKey mismatch for image %s in room %s. Expected %s, got %s",
			imageID, roomID, reconstructedKey, image.StorageKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Image integrity check failed"})
		return
	}

	// Generate new UUID for the file
	fileID := uuid.New().String()
	newStorageKey := fmt.Sprintf("%s/%s%s", roomID, fileID, ext)

	// Copy file in MinIO
	copyCtx, copyCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer copyCancel()

	err = state.MinIOClient.Copy(copyCtx, reconstructedKey, newStorageKey, image.Size, contentTypeForExt(ext))
	if err != nil {
		log.Printf("Failed to copy image to files: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to copy image to files"})
		return
	}

	// Create new File document
	fileRecord := models.File{
		ID:         fileID,
		RoomID:     roomID,
		UploaderID: image.UploaderID,
		Name:       image.Name,
		Size:       image.Size,
		StorageKey: newStorageKey,
		CreatedAt:  time.Now(),
		ExpireAt:   room.ExpireAt,
	}

	// Save to files collection
	fileCollection := state.MongoDatabase.Collection("files")
	_, err = fileCollection.InsertOne(ctx, fileRecord)
	if err != nil {
		// Cleanup MinIO on DB failure
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if cleanupErr := state.MinIOClient.Delete(cleanupCtx, newStorageKey); cleanupErr != nil {
			log.Printf("Warning: failed to cleanup MinIO file %s after DB error: %v", newStorageKey, cleanupErr)
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save image to files"})
		return
	}

	// Construct download URL
	fileRecord.URL = fmt.Sprintf("/api/rooms/%s/files/%s/download", roomID, fileID)

	c.JSON(http.StatusCreated, fileRecord)
}

// InsertFileToImages handles POST /api/rooms/:room/files/:id/insert-to-images
// Copies a file to the images collection for use in the document
func InsertFileToImages(c *gin.Context) {
	roomID := c.Param("room")
	fileID := c.Param("id")

	// Get the file
	collection := state.MongoDatabase.Collection("files")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var file models.File
	err := collection.FindOne(ctx, bson.M{"_id": fileID, "room_id": roomID}).Decode(&file)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Validate file is an image type
	ext := strings.ToLower(filepath.Ext(file.Name))
	if !isAllowedImageType(ext) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "File is not an image. Allowed types: jpeg, png, gif, webp",
		})
		return
	}

	// Get room for expiration
	roomCollection := state.MongoDatabase.Collection("rooms")
	var room models.Room
	err = roomCollection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Generate new UUID for the image
	imageUUID := uuid.New().String()
	newStorageKey := fmt.Sprintf("%s/%s%s", roomID, imageUUID, ext)

	// Copy file in MinIO
	copyCtx, copyCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer copyCancel()

	err = state.MinIOClient.Copy(copyCtx, file.StorageKey, newStorageKey, file.Size, contentTypeForExt(ext))
	if err != nil {
		log.Printf("Failed to copy file to images: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to copy file to images"})
		return
	}

	// Create new Image document with ref_count = 1
	// Track the source file ID to prevent duplicates when saving back
	now := time.Now()
	imageRecord := models.Image{
		ID:           imageUUID,
		RoomID:       roomID,
		UploaderID:   file.UploaderID,
		Name:         file.Name,
		Size:         file.Size,
		StorageKey:   newStorageKey,
		RefCount:     1,
		LastUsedAt:   now,
		CreatedAt:    now,
		ExpireAt:     room.ExpireAt,
		SourceFileID: file.ID, // Track original file to prevent duplicates
	}

	// Save to images collection
	imageCollection := state.MongoDatabase.Collection("images")
	_, err = imageCollection.InsertOne(ctx, imageRecord)
	if err != nil {
		// Cleanup MinIO on DB failure
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if cleanupErr := state.MinIOClient.Delete(cleanupCtx, newStorageKey); cleanupErr != nil {
			log.Printf("Warning: failed to cleanup MinIO file %s after DB error: %v", newStorageKey, cleanupErr)
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to insert file to images"})
		return
	}

	// Construct URL for raw image serving
	imageRecord.URL = fmt.Sprintf("/api/rooms/%s/images/%s/raw", roomID, imageUUID)

	c.JSON(http.StatusCreated, imageRecord)
}