package cleanup

import (
	"context"
	"log"
	"time"

	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
)

// StartImageCleanupJob starts a background goroutine that periodically
// cleans up orphaned images (ref_count=0 and last_used_at older than 1 hour).
// Returns a stop channel to gracefully shutdown the cleanup goroutine.
func StartImageCleanupJob(interval time.Duration) chan struct{} {
	stopCh := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				cleanupOrphanedImages()
			case <-stopCh:
				log.Println("Image cleanup job stopped")
				return
			}
		}
	}()
	return stopCh
}

// cleanupOrphanedImages finds and removes images where ref_count=0
// and last_used_at is older than 1 hour
func cleanupOrphanedImages() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	imagesCollection := state.MongoDatabase.Collection("images")

	// Find images where ref_count=0 AND last_used_at < now - 1 hour
	oneHourAgo := time.Now().Add(-1 * time.Hour)

	filter := bson.M{
		"ref_count":    0,
		"last_used_at": bson.M{"$lt": oneHourAgo},
	}

	// Find all orphaned images first to get their storage keys
	cursor, err := imagesCollection.Find(ctx, filter)
	if err != nil {
		log.Printf("Image cleanup: failed to find orphaned images: %v", err)
		return
	}
	defer cursor.Close(ctx)

	type orphanedImage struct {
		ID         string `bson:"_id"`
		StorageKey string `bson:"storage_key"`
	}

	var orphanedImages []orphanedImage
	if err := cursor.All(ctx, &orphanedImages); err != nil {
		log.Printf("Image cleanup: failed to decode orphaned images: %v", err)
		return
	}

	if len(orphanedImages) == 0 {
		log.Println("Image cleanup: no orphaned images found")
		return
	}

	log.Printf("Image cleanup: found %d orphaned images to clean", len(orphanedImages))

	// Collect storage keys for batch deletion from MinIO
	var storageKeys []string
	var imageIDs []string
	for _, img := range orphanedImages {
		if img.StorageKey != "" {
			storageKeys = append(storageKeys, img.StorageKey)
		}
		imageIDs = append(imageIDs, img.ID)
	}

	// Delete from MinIO using batch operation
	if len(storageKeys) > 0 {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := state.MinIOClient.DeleteBatch(cleanupCtx, storageKeys); err != nil {
			log.Printf("Image cleanup: failed to delete MinIO objects: %v", err)
			cleanupCancel()
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

	log.Printf("Image cleanup: deleted %d images", result.DeletedCount)
}