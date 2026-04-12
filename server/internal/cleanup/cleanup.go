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
// Returns a stop channel to gracefully shutdown the cleanup goroutine.
func StartOrphanedFilesCleanup(interval time.Duration) chan struct{} {
	stopCh := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				cleanupOrphanedFiles()
			case <-stopCh:
				log.Println("Orphaned files cleanup stopped")
				return
			}
		}
	}()
	return stopCh
}

// cleanupOrphanedFiles finds and removes MinIO files whose rooms no longer exist
// Uses aggregation with $lookup to find orphaned rooms in a single query (fixes N+1 pattern)
func cleanupOrphanedFiles() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	filesCollection := state.MongoDatabase.Collection("files")

	// Use aggregation pipeline to find orphaned room_ids in a single query
	// Pipeline: distinct room_ids -> lookup rooms -> filter where room not found
	pipeline := []bson.M{
		// Group by room_id to get unique room_ids
		{"$group": bson.M{"_id": "$room_id"}},
		// Lookup to check if room exists in rooms collection
		{"$lookup": bson.M{
			"from":         "rooms",
			"localField":   "_id",
			"foreignField": "slug",
			"as":           "room",
		}},
		// Match where room doesn't exist (empty room array)
		{"$match": bson.M{"room": bson.M{"$size": 0}}},
		// Project just the orphaned room_id
		{"$project": bson.M{"room_id": "$_id"}},
	}

	cursor, err := filesCollection.Aggregate(ctx, pipeline)
	if err != nil {
		log.Printf("Cleanup: failed to find orphaned rooms: %v", err)
		return
	}
	defer cursor.Close(ctx)

	var orphanedRooms []struct {
		RoomID string `bson:"room_id"`
	}
	if err := cursor.All(ctx, &orphanedRooms); err != nil {
		log.Printf("Cleanup: failed to decode orphaned rooms: %v", err)
		return
	}

	if len(orphanedRooms) == 0 {
		log.Println("Cleanup: no orphaned files found")
		return
	}

	log.Printf("Cleanup: found %d orphaned rooms to clean", len(orphanedRooms))

	// Delete files for each orphaned room
	for _, room := range orphanedRooms {
		log.Printf("Cleanup: room %s no longer exists, cleaning up files", room.RoomID)

		// Delete from MinIO using batch operation
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := state.MinIOClient.DeleteByPrefix(cleanupCtx, room.RoomID+"/"); err != nil {
			log.Printf("Cleanup: failed to delete MinIO files for room %s: %v", room.RoomID, err)
		}
		cleanupCancel()

		// Delete file metadata from MongoDB
		_, err := filesCollection.DeleteMany(ctx, bson.M{"room_id": room.RoomID})
		if err != nil {
			log.Printf("Cleanup: failed to delete file metadata for room %s: %v", room.RoomID, err)
		}
	}

	log.Println("Cleanup: orphaned files cleanup completed")
}