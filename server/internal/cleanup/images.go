package cleanup

import (
	"context"
	"log"
	"time"

	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// StartImageCleanupJob starts a background goroutine that periodically
// cleans up unused images (ref_count=0 and last_used_at older than the grace period,
// plus images whose room no longer exists).
// Returns a stop channel to gracefully shutdown the cleanup goroutine.
func StartImageCleanupJob(interval time.Duration) chan struct{} {
	stopCh := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				cleanupUnusedImages()
				cleanupOrphanedImages()
			case <-stopCh:
				log.Println("Image cleanup job stopped")
				return
			}
		}
	}()
	return stopCh
}

// cleanupUnusedImages finds and removes images where ref_count=0
// and last_used_at is older than the grace period (state.UnusedImageGracePeriod).
func cleanupUnusedImages() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	imagesCollection := state.MongoDatabase.Collection("images")

	// Find images where ref_count=0 AND last_used_at is older than the grace period
	gracePeriodAgo := time.Now().Add(-state.UnusedImageGracePeriod)

	filter := bson.M{
		"ref_count":    0,
		"last_used_at": bson.M{"$lt": gracePeriodAgo},
	}

	// Find all orphaned images first to get their storage keys
	cursor, err := imagesCollection.Find(ctx, filter)
	if err != nil {
		log.Printf("Image cleanup: failed to find unused images: %v", err)
		return
	}
	defer cursor.Close(ctx)

	type orphanedImage struct {
		ID           string `bson:"_id"`
		StorageKey   string `bson:"storage_key"`
		ThumbnailKey string `bson:"thumbnail_key"`
	}

	var unusedImages []orphanedImage
	if err := cursor.All(ctx, &unusedImages); err != nil {
		log.Printf("Image cleanup: failed to decode unused images: %v", err)
		return
	}

	if len(unusedImages) == 0 {
		log.Println("Image cleanup: no unused images found")
		return
	}

	log.Printf("Image cleanup: found %d unused images to clean", len(unusedImages))

	// Collect storage keys for batch deletion from MinIO
	var storageKeys []string
	for _, img := range unusedImages {
		if img.StorageKey != "" {
			storageKeys = append(storageKeys, img.StorageKey)
		}
		if img.ThumbnailKey != "" {
			storageKeys = append(storageKeys, img.ThumbnailKey)
		}
	}

	// Delete from MinIO using batch operation
	if len(storageKeys) > 0 {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := state.MinIOClient.DeleteBatch(cleanupCtx, storageKeys); err != nil {
			cleanupCancel()
			log.Printf("Image cleanup: failed to delete MinIO objects: %v", err)
			return
		}
		cleanupCancel()
	}

	// Delete image metadata from MongoDB
	result, err := imagesCollection.DeleteMany(ctx, filter)
	if err != nil {
		log.Printf("Image cleanup: failed to delete image metadata: %v", err)
		return
	}

	log.Printf("Image cleanup: deleted %d unused images", result.DeletedCount)
}

// cleanupOrphanedImages finds and removes images whose room no longer exists.
// This catches images that were in active rooms when the room was TTL-deleted
// or manually deleted, but whose metadata wasn't cleaned up.
func cleanupOrphanedImages() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	imagesCollection := state.MongoDatabase.Collection("images")
	roomsCollection := state.MongoDatabase.Collection("rooms")

	// Find distinct room_ids in the images collection
	distinctResult, err := imagesCollection.Distinct(ctx, "room_id", bson.M{})
	if err != nil {
		log.Printf("Orphaned image cleanup: failed to find distinct room_ids: %v", err)
		return
	}

	// Convert to string slice
	var roomIDs []string
	for _, id := range distinctResult {
		roomIDs = append(roomIDs, id.(string))
	}

	if len(roomIDs) == 0 {
		return
	}

	// Find which room_ids still exist in the rooms collection
	cursor, err := roomsCollection.Find(ctx, bson.M{"slug": bson.M{"$in": roomIDs}}, options.Find().SetProjection(bson.M{"slug": 1}))
	if err != nil {
		log.Printf("Orphaned image cleanup: failed to query rooms: %v", err)
		return
	}
	defer cursor.Close(ctx)

	existingSlugs := make(map[string]bool)
	for cursor.Next(ctx) {
		var room models.Room
		if err := cursor.Decode(&room); err == nil {
			existingSlugs[room.Slug] = true
		}
	}

	// Find orphaned room IDs (in images but not in rooms)
	var orphanedRoomIDs []string
	for _, id := range roomIDs {
		if !existingSlugs[id] {
			orphanedRoomIDs = append(orphanedRoomIDs, id)
		}
	}

	if len(orphanedRoomIDs) == 0 {
		log.Println("Orphaned image cleanup: no orphaned images found")
		return
	}

	log.Printf("Orphaned image cleanup: found %d rooms with orphaned images", len(orphanedRoomIDs))

	// Delete MinIO objects for each orphaned room
	for _, roomID := range orphanedRoomIDs {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := state.MinIOClient.DeleteByPrefix(cleanupCtx, roomID+"/"); err != nil {
			log.Printf("Orphaned image cleanup: failed to delete MinIO objects for room %s: %v", roomID, err)
		}
		cleanupCancel()
	}

	// Delete image metadata for all orphaned rooms
	filter := bson.M{"room_id": bson.M{"$in": orphanedRoomIDs}}
	result, err := imagesCollection.DeleteMany(ctx, filter)
	if err != nil {
		log.Printf("Orphaned image cleanup: failed to delete image metadata: %v", err)
		return
	}

	log.Printf("Orphaned image cleanup: deleted %d orphaned images", result.DeletedCount)
}