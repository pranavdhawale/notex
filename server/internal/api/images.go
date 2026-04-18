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

// allowedMimeTypes maps detected MIME types to allowed file extensions.
// Used to verify that the actual content matches the claimed extension.
var allowedMimeTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// validateImageContentType verifies that the actual content type of the file
// matches the claimed extension. This prevents uploading malicious files with
// image extensions (e.g., renaming malware.exe to image.jpg).
func validateImageContentType(data []byte, ext string) bool {
	detected := http.DetectContentType(data[:min(len(data), 512)])
	expectedExt, ok := allowedMimeTypes[detected]
	if !ok {
		return false
	}
	// .jpg and .jpeg are both valid for image/jpeg
	if ext == ".jpeg" {
		ext = ".jpg"
	}
	return expectedExt == ext
}

const MaxImageSize = 10 * 1024 * 1024 // 10MB for images
const ThumbnailSize = 300             // Max width/height for thumbnails (300px)
const maxRefCount = 1000 // Maximum ref_count to prevent abuse
// Trust model: The client reports reference counts via /reconcile, which the server
// clamps to [0, maxRefCount]. A malicious client could set ref_count=1 on all images
// to prevent GC, but this is acceptable in v1 (guest-only auth). The 5-minute grace
// period after ref_count drops to 0 prevents premature deletion of images still in use.

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

	// WebP thumbnails are encoded as PNG (no Go WebP encoder), so use .png extension
	thumbExt := ext
	if ext == ".webp" {
		thumbExt = ".png"
	}
	thumbnailKey := fmt.Sprintf("%s/%s_thumb%s", roomID, imageID, thumbExt)

	// Open the uploaded file
	fileHandle, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read image"})
		return
	}
	defer fileHandle.Close()

	// Read file content into memory, capped at MaxImageSize + 1 byte
	// to prevent OOM from oversized uploads that bypass FormFile size checks.
	limitedReader := io.LimitReader(fileHandle, MaxImageSize+1)
	fileData, err := io.ReadAll(limitedReader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read image data"})
		return
	}
	if len(fileData) > MaxImageSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Image exceeds 10MB limit"})
		return
	}

	// Validate actual content type matches the claimed extension
	if !validateImageContentType(fileData, ext) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "File content does not match the declared image type",
		})
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

	// Verify room still exists after upload (race condition protection)
	roomCheckCtx2, roomCheckCancel2 := context.WithTimeout(context.Background(), 2*time.Second)
	var stillExists models.Room
	err = roomCollection.FindOne(roomCheckCtx2, bson.M{"slug": roomID}).Decode(&stillExists)
	roomCheckCancel2()
	if err != nil {
		// Room was deleted during upload — cleanup MinIO objects
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if cleanupErr := state.MinIOClient.Delete(cleanupCtx, storageKey); cleanupErr != nil {
			log.Printf("Warning: failed to cleanup MinIO object %s after room deletion: %v", storageKey, cleanupErr)
		}
		if thumbData != nil {
			if cleanupErr := state.MinIOClient.Delete(cleanupCtx, thumbnailKey); cleanupErr != nil {
				log.Printf("Warning: failed to cleanup thumbnail %s after room deletion: %v", thumbnailKey, cleanupErr)
			}
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
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
		ExpireAt:     stillExists.ExpireAt, // Inherit TTL from room (fresh check)
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
			"hasMore": len(images) == limit && offset+limit < int(totalCount),
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

	// Verify actual content size via StatObject for accurate Content-Length
	statCtx, statCancel := context.WithTimeout(context.Background(), 5*time.Second)
	objInfo, statErr := state.MinIOClient.Stat(statCtx, reconstructedKey)
	statCancel()
	contentLength := image.Size // fallback to DB value
	if statErr == nil {
		contentLength = objInfo.Size
	}

	// Determine content type from file extension
	contentType := contentTypeForExt(ext)

	// Security headers for inline rendering
	c.Header("Content-Type", contentType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Frame-Options", "DENY")
	c.Header("Cache-Control", "private, max-age=3600")

	c.DataFromReader(http.StatusOK, contentLength, contentType, reader, nil)
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

	// Determine which key to serve: thumbnail or original
	ext := filepath.Ext(image.Name)
	isThumbnail := image.ThumbnailKey != ""

	serveKey := image.StorageKey // default: serve original
	serveContentType := contentTypeForExt(ext)
	if isThumbnail {
		// WebP thumbnails are stored as PNG with .png extension
		thumbExt := ext
		if ext == ".webp" {
			thumbExt = ".png"
		}
		// Reconstruct expected thumbnail key from verified components
		expectedKey := fmt.Sprintf("%s/%s_thumb%s", roomID, image.ID, thumbExt)
		if image.ThumbnailKey != expectedKey {
			log.Printf("Security warning: thumbnailKey mismatch for image %s in room %s. Expected %s, got %s",
				imageID, roomID, expectedKey, image.ThumbnailKey)
			// Fall back to serving the original image
			isThumbnail = false
		} else {
			serveKey = expectedKey
			if ext == ".webp" {
				serveContentType = "image/png" // WebP thumbnails are stored as PNG
			}
		}
	}

	// Stream from MinIO
	downloadCtx, downloadCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer downloadCancel()

	reader, err := state.MinIOClient.Download(downloadCtx, serveKey)
	if err != nil && isThumbnail {
		// Thumbnail failed, fall back to original
		reader, err = state.MinIOClient.Download(downloadCtx, image.StorageKey)
		isThumbnail = false
	}
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image content missing"})
		return
	}
	defer reader.Close()

	// Get actual content size via StatObject for accurate Content-Length
	statCtx, statCancel := context.WithTimeout(context.Background(), 5*time.Second)
	objInfo, statErr := state.MinIOClient.Stat(statCtx, serveKey)
	statCancel()
	contentLength := int64(-1) // fallback: unknown size
	if statErr == nil {
		contentLength = objInfo.Size
	}

	// Determine content type — use the correct type for the served content
	c.Header("Content-Type", serveContentType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Frame-Options", "DENY")
	if isThumbnail {
		c.Header("Cache-Control", "private, max-age=86400") // Cache thumbnails for 24 hours
	} else {
		c.Header("Cache-Control", "private, max-age=3600") // Cache originals for 1 hour
	}

	c.DataFromReader(http.StatusOK, contentLength, serveContentType, reader, nil)
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

	// Security: Reconstruct storageKey from verified components BEFORE deletion
	ext := filepath.Ext(image.Name)
	reconstructedKey := fmt.Sprintf("%s/%s%s", roomID, image.ID, ext)

	// Verify the reconstructed key matches the stored key (defense in depth)
	if reconstructedKey != image.StorageKey {
		log.Printf("Security warning: storageKey mismatch for image %s in room %s. Expected %s, got %s",
			imageID, roomID, reconstructedKey, image.StorageKey)
		// Fall back to stored key if mismatch — metadata still exists for manual cleanup
		reconstructedKey = image.StorageKey
	}

	// Delete from MinIO first (best effort) — if this fails, DB record remains for retry
	deleteCtx, deleteCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer deleteCancel()
	if err := state.MinIOClient.Delete(deleteCtx, reconstructedKey); err != nil {
		log.Printf("Warning: failed to delete from MinIO: %v", err)
	}
	// Also delete thumbnail if it exists — reconstruct key from verified components
	if image.ThumbnailKey != "" {
		thumbExt := ext
		if ext == ".webp" {
			thumbExt = ".png"
		}
		expectedThumbKey := fmt.Sprintf("%s/%s_thumb%s", roomID, image.ID, thumbExt)
		thumbKey := image.ThumbnailKey
		if image.ThumbnailKey != expectedThumbKey {
			log.Printf("Security warning: thumbnailKey mismatch for image %s in room %s. Expected %s, got %s",
				imageID, roomID, expectedThumbKey, image.ThumbnailKey)
			thumbKey = image.ThumbnailKey // fall back to stored key for cleanup
		}
		if err := state.MinIOClient.Delete(deleteCtx, thumbKey); err != nil {
			log.Printf("Warning: failed to delete thumbnail from MinIO: %v", err)
		}
	}

	// Delete from DB after MinIO — metadata remains for cleanup retry if MinIO failed
	_, err = collection.DeleteOne(ctx, bson.M{"_id": imageID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Image deleted"})
}

// BatchDeleteImagesRequest represents the request body for BatchDeleteImages
type BatchDeleteImagesRequest struct {
	ImageIDs []string `json:"imageIds" binding:"required"`
}

// BatchDeleteImages handles POST /api/rooms/:room/images/batch-delete
// Deletes multiple images at once. The requestor must be the uploader of each
// image or the room owner.
func BatchDeleteImages(c *gin.Context) {
	roomID := c.Param("room")
	requestorID := c.GetString("userID")

	if requestorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Authentication required"})
		return
	}

	var req BatchDeleteImagesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if len(req.ImageIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No image IDs provided"})
		return
	}

	if len(req.ImageIDs) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Too many image IDs (max 100)"})
		return
	}

	// Fetch the room to check ownership
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

	isOwner := room.Owner == requestorID

	// Fetch all requested images
	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":     bson.M{"$in": req.ImageIDs},
		"room_id": roomID,
	}
	opts := options.Find().SetProjection(bson.M{
		"_id":           1,
		"room_id":       1,
		"uploader_id":   1,
		"name":          1,
		"storage_key":   1,
		"thumbnail_key": 1,
	})

	cursor, err := collection.Find(ctx, filter, opts)
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

	// Separate images into deletable and forbidden
	type failedItem struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}

	var deletable []models.Image
	var failed []failedItem

	foundIDs := make(map[string]bool)
	for _, img := range images {
		foundIDs[img.ID] = true
		if img.UploaderID == requestorID || isOwner {
			deletable = append(deletable, img)
		} else {
			failed = append(failed, failedItem{
				ID:     img.ID,
				Reason: "permission denied",
			})
		}
	}

	// Report image IDs that were not found
	for _, id := range req.ImageIDs {
		if !foundIDs[id] {
			failed = append(failed, failedItem{
				ID:     id,
				Reason: "not found",
			})
		}
	}

	if len(deletable) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"deleted": 0,
			"failed":   failed,
		})
		return
	}

	// Collect storage keys for batch MinIO deletion (reconstructed from verified components)
	var storageKeys []string
	var deletableIDs []string
	for _, img := range deletable {
		ext := filepath.Ext(img.Name)
		reconstructedKey := fmt.Sprintf("%s/%s%s", roomID, img.ID, ext)
		if reconstructedKey != img.StorageKey {
			log.Printf("Security warning: storageKey mismatch for image %s in room %s. Expected %s, got %s",
				img.ID, roomID, reconstructedKey, img.StorageKey)
			reconstructedKey = img.StorageKey
		}
		storageKeys = append(storageKeys, reconstructedKey)
		if img.ThumbnailKey != "" {
			thumbExt := ext
			if ext == ".webp" {
				thumbExt = ".png"
			}
			expectedThumbKey := fmt.Sprintf("%s/%s_thumb%s", roomID, img.ID, thumbExt)
			if img.ThumbnailKey != expectedThumbKey {
				log.Printf("Security warning: thumbnailKey mismatch for image %s in room %s. Expected %s, got %s",
					img.ID, roomID, expectedThumbKey, img.ThumbnailKey)
				storageKeys = append(storageKeys, img.ThumbnailKey)
			} else {
				storageKeys = append(storageKeys, expectedThumbKey)
			}
		}
		deletableIDs = append(deletableIDs, img.ID)
	}

	// Delete from MinIO first (batch) — best effort; DB records remain for retry on failure
	deleteCtx, deleteCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer deleteCancel()
	if err := state.MinIOClient.DeleteBatch(deleteCtx, storageKeys); err != nil {
		log.Printf("Warning: some MinIO deletions may have failed in batch delete: %v", err)
	}

	// Delete from MongoDB by _id with $in
	dbResult, err := collection.DeleteMany(ctx, bson.M{"_id": bson.M{"$in": deletableIDs}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"deleted": dbResult.DeletedCount,
		"failed":   failed,
	})
}

// ReconcileImageRefsRequest represents the request body for ReconcileImageRefs
type ReconcileImageRefsRequest struct {
	ImageCounts map[string]int `json:"imageCounts" binding:"required"`
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

	collection := state.MongoDatabase.Collection("images")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()
	var updatedCount int

	// Build sets of referenced vs unreferenced image IDs for efficient updates
	referencedIDs := make(map[string]int)
	for id, count := range req.ImageCounts {
		if count < 0 {
			count = 0
		}
		if count > maxRefCount {
			count = maxRefCount
		}
		referencedIDs[id] = count
	}

	// Batch update: set ref_count and last_used_at for referenced images
	if len(referencedIDs) > 0 {
		var writeModels []mongo.WriteModel
		for id, count := range referencedIDs {
			writeModels = append(writeModels, mongo.NewUpdateOneModel().
				SetFilter(bson.M{"_id": id, "room_id": roomID}).
				SetUpdate(bson.M{"$set": bson.M{
					"ref_count":   count,
					"last_used_at": now,
				}}))
		}
		result, err := collection.BulkWrite(ctx, writeModels)
		if err != nil {
			log.Printf("Warning: failed to bulk update referenced images: %v", err)
		} else {
			updatedCount += int(result.ModifiedCount)
		}
	}

	// Zero out ref_count for images in the room that are NOT in the document
	unreferencedFilter := bson.M{
		"room_id":   roomID,
		"ref_count": bson.M{"$gt": 0},
	}
	if len(referencedIDs) > 0 {
		unreferencedFilter["_id"] = bson.M{"$nin": func() []string {
			ids := make([]string, 0, len(referencedIDs))
			for id := range referencedIDs {
				ids = append(ids, id)
			}
			return ids
		}()}
	}
	result, err := collection.UpdateMany(ctx, unreferencedFilter, bson.M{
		"$set": bson.M{
			"ref_count":    0,
			"last_used_at": now,
		},
	})
	if err != nil {
		log.Printf("Warning: failed to zero unreferenced images: %v", err)
	} else {
		updatedCount += int(result.ModifiedCount)
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

	// Find all images with ref_count = 0 that haven't been used recently
	// Grace period prevents deleting images the user just removed
	// from the document (they might undo the removal)
	collection := state.MongoDatabase.Collection("images")
	gracePeriodAgo := time.Now().Add(-state.UnusedImageGracePeriod)
	filter := bson.M{
		"room_id":   roomID,
		"ref_count": 0,
		"last_used_at": bson.M{"$lt": gracePeriodAgo},
	}

	opts := options.Find().SetProjection(bson.M{"_id": 1, "name": 1, "storage_key": 1, "thumbnail_key": 1})
	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer cursor.Close(ctx)

	// Reconstruct storage keys from verified components and collect for MinIO deletion
	var storageKeys []string
	var imageIDs []string
	for cursor.Next(ctx) {
		var image models.Image
		if err := cursor.Decode(&image); err != nil {
			log.Printf("Error: failed to decode image document for cleanup: %v", err)
			continue
		}
		reconstructedKey := fmt.Sprintf("%s/%s%s", roomID, image.ID, filepath.Ext(image.Name))
		if reconstructedKey != image.StorageKey {
			log.Printf("Security warning: storageKey mismatch for image %s in room %s. Expected %s, got %s",
				image.ID, roomID, reconstructedKey, image.StorageKey)
			// Fall back to stored key if mismatch
			reconstructedKey = image.StorageKey
		}
		storageKeys = append(storageKeys, reconstructedKey)
		if image.ThumbnailKey != "" {
			storageKeys = append(storageKeys, image.ThumbnailKey)
		}
		imageIDs = append(imageIDs, image.ID)
	}

	if err := cursor.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error during image scan"})
		return
	}

	if len(storageKeys) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No unused images to cleanup", "count": 0})
		return
	}

	// Delete from MinIO first using batch operation — if some fail, DB records remain for retry
	batchCtx, batchCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer batchCancel()

	if err := state.MinIOClient.DeleteBatch(batchCtx, storageKeys); err != nil {
		log.Printf("Warning: some MinIO deletions may have failed: %v", err)
	}

	// Delete from DB by _id to avoid TOCTOU race — only delete the specific documents we found
	deleteFilter := bson.M{"_id": bson.M{"$in": imageIDs}}
	result, err := collection.DeleteMany(ctx, deleteFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete from database"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Unused images cleaned up",
		"count":   result.DeletedCount,
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
	fileCollection := state.MongoDatabase.Collection("files")
	if image.SourceFileID != "" {
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

	// Bidirectional dedup: check if a file already exists that was created from this image
	var existingFile models.File
	err = fileCollection.FindOne(ctx, bson.M{"source_image_id": imageID, "room_id": roomID}).Decode(&existingFile)
	if err == nil {
		// File already exists for this image, return it with duplicate flag
		existingFile.URL = fmt.Sprintf("/api/rooms/%s/files/%s/download", roomID, existingFile.ID)
		c.JSON(http.StatusOK, gin.H{
			"file":         existingFile,
			"isDuplicate": true,
		})
		return
	}
	// If err != nil (not found), continue to create a new file

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

	// Verify source image still exists in MinIO before copying
	statCtx, statCancel := context.WithTimeout(context.Background(), 5*time.Second)
	_, err = state.MinIOClient.Stat(statCtx, reconstructedKey)
	statCancel()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Source image content not found"})
		return
	}

	// Copy file in MinIO
	copyCtx, copyCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer copyCancel()

	err = state.MinIOClient.Copy(copyCtx, reconstructedKey, newStorageKey, image.Size, contentTypeForExt(ext))
	if err != nil {
		log.Printf("Failed to copy image to files: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to copy image to files"})
		return
	}

	// Create new File document with SourceImageID for bidirectional dedup
	fileRecord := models.File{
		ID:            fileID,
		RoomID:        roomID,
		UploaderID:    image.UploaderID,
		Name:          image.Name,
		Size:          image.Size,
		StorageKey:    newStorageKey,
		CreatedAt:     time.Now(),
		ExpireAt:      room.ExpireAt,
		SourceImageID: imageID,
	}

	// Save to files collection
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

	// Check if an image already exists for this file (prevent duplicates)
	imageCollection := state.MongoDatabase.Collection("images")
	var existingImage models.Image
	err = imageCollection.FindOne(ctx, bson.M{"source_file_id": file.ID, "room_id": roomID}).Decode(&existingImage)
	if err == nil {
		// Image already exists for this file, return it with duplicate flag
		existingImage.URL = fmt.Sprintf("/api/rooms/%s/images/%s/raw", roomID, existingImage.ID)
		if existingImage.ThumbnailKey != "" {
			existingImage.ThumbnailURL = fmt.Sprintf("/api/rooms/%s/images/%s/thumbnail", roomID, existingImage.ID)
		}
		c.JSON(http.StatusOK, gin.H{
			"image":        existingImage,
			"isDuplicate": true,
		})
		return
	}
	// If err != nil (not found), continue to create new image

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

	// Try to decode the image to get dimensions and generate a thumbnail
	var width, height int
	var thumbData []byte
	downloadCtx2, downloadCancel2 := context.WithTimeout(context.Background(), 30*time.Second)
	defer downloadCancel2()
	reader, err := state.MinIOClient.Download(downloadCtx2, file.StorageKey)
	if err != nil {
		log.Printf("Warning: failed to download file for thumbnail generation: %v", err)
	} else {
		fileData, err := io.ReadAll(io.LimitReader(reader, MaxImageSize+1))
		reader.Close()
		if err != nil {
			log.Printf("Warning: failed to read file for thumbnail generation: %v", err)
		} else if len(fileData) <= MaxImageSize {
			if img, decodeErr := decodeImage(fileData, ext); decodeErr != nil {
				log.Printf("Warning: could not decode file-to-image for thumbnail: %v", decodeErr)
			} else {
				bounds := img.Bounds()
				width = bounds.Dx()
				height = bounds.Dy()
				td, _, _, thumbErr := generateThumbnail(img, ext)
				if thumbErr != nil {
					log.Printf("Warning: could not generate thumbnail for file-to-image: %v", thumbErr)
				} else {
					thumbData = td
				}
			}
		}
	}

	// WebP thumbnails are stored as PNG
	thumbExt := ext
	if ext == ".webp" {
		thumbExt = ".png"
	}
	var thumbnailKey string
	if thumbData != nil {
		thumbnailKey = fmt.Sprintf("%s/%s_thumb%s", roomID, imageUUID, thumbExt)
		thumbContentType := contentTypeForExt(thumbExt)
		uploadCtx, uploadCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := state.MinIOClient.Upload(uploadCtx, thumbnailKey, bytes.NewReader(thumbData), int64(len(thumbData)), thumbContentType); err != nil {
			log.Printf("Warning: failed to upload thumbnail for file-to-image: %v", err)
			thumbnailKey = "" // Clear so we fall back to original
		}
		uploadCancel()
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
		Width:        width,
		Height:       height,
		StorageKey:   newStorageKey,
		ThumbnailKey: thumbnailKey,
		RefCount:     1,
		LastUsedAt:   now,
		CreatedAt:    now,
		ExpireAt:     room.ExpireAt,
		SourceFileID: file.ID, // Track original file to prevent duplicates
	}

	// Save to images collection
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

	// Construct URLs for image serving
	imageRecord.URL = fmt.Sprintf("/api/rooms/%s/images/%s/raw", roomID, imageUUID)
	if thumbnailKey != "" {
		imageRecord.ThumbnailURL = fmt.Sprintf("/api/rooms/%s/images/%s/thumbnail", roomID, imageUUID)
	}

	c.JSON(http.StatusCreated, imageRecord)
}