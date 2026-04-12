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

// Semaphore to limit concurrent background TTL update goroutines
// Prevents resource exhaustion under high load
const maxConcurrentTTLUpdates = 10

var ttlUpdateSemaphore = make(chan struct{}, maxConcurrentTTLUpdates)

// init pre-fills the semaphore to allow immediate use
func init() {
	for i := 0; i < maxConcurrentTTLUpdates; i++ {
		ttlUpdateSemaphore <- struct{}{}
	}
}

// acquireSemaphore attempts to acquire a semaphore slot for TTL update
// Returns true if acquired, false if at capacity
func acquireSemaphore() bool {
	select {
	case <-ttlUpdateSemaphore:
		return true
	default:
		return false
	}
}

// releaseSemaphore returns a semaphore slot after TTL update completes
func releaseSemaphore() {
	select {
	case ttlUpdateSemaphore <- struct{}{}:
	default:
	}
}

type CreateRoomRequest struct {
	Owner      string  `json:"owner" binding:"required,max=100"`
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
		// Return generic validation error to avoid leaking internal details
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
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

		// Check if already exists (use FindOne instead of CountDocuments for better performance)
		var existingRoom models.Room
		err = collection.FindOne(ctx, bson.M{"slug": customSlug}).Decode(&existingRoom)
		if err == nil {
			// Room exists
			c.JSON(http.StatusConflict, gin.H{"error": "Room slug already taken"})
			return
		}
		if err != mongo.ErrNoDocuments {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check slug availability"})
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

	// Cache the new room for WebSocket connections
	state.GetRoomCache().Set(slug, &state.RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: room.ExpireAt,
	})

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
	// Use semaphore to limit concurrent TTL update goroutines
	if acquireSemaphore() {
		go func(s string, t time.Time) {
			defer releaseSemaphore()
			bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer bgCancel()
			// Use $max to atomically update expire_at only if new value is greater
			// This prevents race conditions when multiple requests update TTL concurrently
			_, err := collection.UpdateOne(bgCtx, bson.M{"slug": s}, bson.M{
				"$max": bson.M{"expire_at": t},
			})
			if err != nil {
				log.Printf("Failed to update room expiry for %s: %v", s, err)
			}

			// Also update file TTL to match room TTL
			if err := state.UpdateFilesTTL(s, t); err != nil {
				log.Printf("Failed to update file TTL for room %s: %v", s, err)
			}
		}(slug, newExpiry)
	} else {
		// If at capacity, log and skip TTL update (not critical)
		log.Printf("TTL update queue at capacity, skipping TTL update for room %s", slug)
	}

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

	// 2. Use transaction for atomic deletion of room and file metadata
	// This ensures we don't end up with orphaned file records if room deletion succeeds but file deletion fails
	err = deleteRoomTransaction(ctx, slug)
	if err != nil {
		log.Printf("Failed to delete room transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// 3. Close WebSocket Connections
	ws.MainHub.CloseRoom(slug)

	// 4. Purge all auth tokens for this room
	state.AuthTokens.DeleteAllForRoom(slug)

	// 5. Invalidate room cache
	state.GetRoomCache().Delete(slug)

	c.JSON(http.StatusOK, gin.H{"message": "Room deleted"})
}

// deleteRoomTransaction handles atomic deletion of room and file metadata
// Falls back to non-transactional deletion if transactions aren't supported (e.g., standalone MongoDB)
func deleteRoomTransaction(ctx context.Context, slug string) error {
	// Try transactional deletion first
	session, err := state.MongoClient.StartSession()
	if err == nil {
		defer session.EndSession(ctx)

		_, err = session.WithTransaction(ctx, func(sessCtx mongo.SessionContext) (interface{}, error) {
			// Delete room
			collection := state.MongoDatabase.Collection("rooms")
			_, err := collection.DeleteOne(sessCtx, bson.M{"slug": slug})
			if err != nil {
				return nil, err
			}

			// Delete files
			fileCollection := state.MongoDatabase.Collection("files")
			_, err = fileCollection.DeleteMany(sessCtx, bson.M{"room_id": slug})
			return nil, err
		})
		// If transaction succeeded, return
		if err == nil {
			return nil
		}
		// If transaction failed due to replica set requirement, fall through to non-transactional deletion
		if strings.Contains(err.Error(), "Transaction numbers are only allowed on a replica set") {
			log.Printf("MongoDB transactions not available (standalone instance), using non-transactional deletion")
		} else {
			// Other transaction errors should be returned
			return err
		}
	} else {
		log.Printf("Warning: MongoDB sessions not available, using non-transactional deletion: %v", err)
	}

	// Fallback: non-transactional deletion (for standalone MongoDB or older versions)
	collection := state.MongoDatabase.Collection("rooms")
	_, err = collection.DeleteOne(ctx, bson.M{"slug": slug})
	if err != nil {
		return err
	}

	fileCollection := state.MongoDatabase.Collection("files")
	// Error intentionally ignored in fallback - room is already deleted, files will be cleaned up by orphaned files cleanup job
	_, _ = fileCollection.DeleteMany(ctx, bson.M{"room_id": slug})
	return nil
}

type SaveRoomRequest struct {
	// Content must be a base64-encoded string (Yjs state vector)
	// Using string instead of interface{} to prevent NoSQL injection
	Content string `json:"content"`
}

// Max content size for room saves (16MB - MongoDB's max document size)
// Base64 encoding increases size by ~33%, so ~12MB binary data fits in 16MB
const MaxContentSize = 16 * 1024 * 1024

// isValidBase64 checks if a string is valid base64
func isValidBase64(s string) bool {
	if len(s) == 0 {
		return false
	}
	// Check length limit
	if len(s) > MaxContentSize {
		return false
	}
	// Base64 only contains A-Z, a-z, 0-9, +, /, and = for padding
	for i, r := range s {
		if !((r >= 'A' && r <= 'Z') ||
			(r >= 'a' && r <= 'z') ||
			(r >= '0' && r <= '9') ||
			r == '+' || r == '/' || r == '=') {
			// Allow newline characters (some base64 encoders include them)
			if r != '\n' && r != '\r' {
				return false
			}
			// Padding (=) should only appear at the end
			if r == '=' && i < len(s)-2 {
				return false
			}
		}
	}
	return true
}

func SaveRoom(c *gin.Context) {
	slug := c.Param("room")

	// Limit request body size
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, int64(MaxContentSize))

	var req SaveRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Validate content is not empty
	if req.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Content is required"})
		return
	}

	// Validate content is valid base64 (prevents NoSQL injection)
	// Content should be a base64-encoded Yjs state vector
	if !isValidBase64(req.Content) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Content must be valid base64-encoded data"})
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

	// Store content as string (base64) - this is safe because we validated it's base64
	// Use $max for expire_at to prevent race conditions with concurrent TTL updates
	update := bson.M{
		"$set": bson.M{
			"content": req.Content,
		},
		"$max": bson.M{
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
