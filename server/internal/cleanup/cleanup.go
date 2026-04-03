package cleanup

import (
	"context"
	"log"
	"time"

	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
)

// StartOrphanedFilesCleanup starts a background goroutine that periodically
// cleans up MinIO files that no longer have a corresponding room in MongoDB.
// This handles the case where MongoDB TTL expires a room but MinIO files remain.
func StartOrphanedFilesCleanup(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			cleanupOrphanedFiles()
		}
	}()
}

// cleanupOrphanedFiles finds and removes MinIO files whose rooms no longer exist
func cleanupOrphanedFiles() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Get all unique room IDs from files collection
	filesCollection := state.MongoDatabase.Collection("files")
	roomsCollection := state.MongoDatabase.Collection("rooms")

	// Find all room_ids in files collection
	roomIDs, err := filesCollection.Distinct(ctx, "room_id", bson.M{})
	if err != nil {
		log.Printf("Cleanup: failed to get distinct room_ids: %v", err)
		return
	}

	// Check each room_id to see if the room still exists
	for _, roomID := range roomIDs {
		roomSlug, ok := roomID.(string)
		if !ok {
			continue
		}

		// Check if room exists
		count, err := roomsCollection.CountDocuments(ctx, bson.M{"slug": roomSlug})
		if err != nil {
			log.Printf("Cleanup: failed to check room %s: %v", roomSlug, err)
			continue
		}

		// If room doesn't exist, delete all files for this room
		if count == 0 {
			log.Printf("Cleanup: room %s no longer exists, cleaning up files", roomSlug)

			// Delete from MinIO
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
			if err := state.MinIOClient.DeleteByPrefix(cleanupCtx, roomSlug+"/"); err != nil {
				log.Printf("Cleanup: failed to delete MinIO files for room %s: %v", roomSlug, err)
			}
			cleanupCancel()

			// Delete file metadata from MongoDB
			_, err := filesCollection.DeleteMany(ctx, bson.M{"room_id": roomSlug})
			if err != nil {
				log.Printf("Cleanup: failed to delete file metadata for room %s: %v", roomSlug, err)
			}
		}
	}

	log.Println("Cleanup: orphaned files cleanup completed")
}