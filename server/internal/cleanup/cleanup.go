package cleanup

import (
	"context"
	"log"
	"time"

	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
)

// istLocation is the IST (Asia/Kolkata) timezone for scheduling.
var istLocation = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		log.Printf("Warning: failed to load IST timezone, using UTC: %v", err)
		return time.UTC
	}
	return loc
}()

// StartOrphanedFilesCleanup starts a background goroutine that runs the
// orphaned rooms cleanup daily at midnight IST.
// Returns a stop channel to gracefully shutdown the goroutine.
func StartOrphanedFilesCleanup() chan struct{} {
	stopCh := make(chan struct{})
	go func() {
		for {
			now := time.Now().In(istLocation)
			next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, istLocation)
			waitDuration := next.Sub(now)

			log.Printf("Cleanup: next orphaned rooms cleanup at %s (in %s)", next.Format(time.RFC3339), waitDuration.Round(time.Minute))

			timer := time.NewTimer(waitDuration)
			select {
			case <-timer.C:
				cleanupOrphanedRooms()
			case <-stopCh:
				timer.Stop()
				log.Println("Orphaned files cleanup stopped")
				return
			}
		}
	}()
	return stopCh
}

// findOrphanedRoomIDs runs an aggregation on the given collection to find
// room_ids that no longer exist in the rooms collection.
func findOrphanedRoomIDs(ctx context.Context, collectionName string) ([]string, error) {
	collection := state.MongoDatabase.Collection(collectionName)

	pipeline := []bson.M{
		{"$group": bson.M{"_id": "$room_id"}},
		{"$lookup": bson.M{
			"from":         "rooms",
			"localField":   "_id",
			"foreignField": "slug",
			"as":           "room",
		}},
		{"$match": bson.M{"room": bson.M{"$size": 0}}},
		{"$project": bson.M{"room_id": "$_id"}},
	}

	cursor, err := collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []struct {
		RoomID string `bson:"room_id"`
	}
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	roomIDs := make([]string, len(results))
	for i, r := range results {
		roomIDs[i] = r.RoomID
	}
	return roomIDs, nil
}

// cleanupOrphanedRooms finds rooms that no longer exist in the database
// and cleans up their MinIO objects, file metadata, and image metadata.
func cleanupOrphanedRooms() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Find orphaned room IDs from both files and images collections
	fileOrphans, err := findOrphanedRoomIDs(ctx, "files")
	if err != nil {
		log.Printf("Cleanup: failed to find orphaned rooms from files: %v", err)
		return
	}

	imageOrphans, err := findOrphanedRoomIDs(ctx, "images")
	if err != nil {
		log.Printf("Cleanup: failed to find orphaned rooms from images: %v", err)
		return
	}

	// Merge and deduplicate orphaned room IDs
	orphanSet := make(map[string]bool)
	for _, id := range fileOrphans {
		orphanSet[id] = true
	}
	for _, id := range imageOrphans {
		orphanSet[id] = true
	}

	if len(orphanSet) == 0 {
		log.Println("Cleanup: no orphaned rooms found")
		return
	}

	log.Printf("Cleanup: found %d orphaned rooms to clean", len(orphanSet))

	filesCollection := state.MongoDatabase.Collection("files")
	imagesCollection := state.MongoDatabase.Collection("images")

	for roomID := range orphanSet {
		log.Printf("Cleanup: room %s no longer exists, cleaning up", roomID)

		// Delete all MinIO objects for this room (files, images, thumbnails)
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := state.MinIOClient.DeleteByPrefix(cleanupCtx, roomID+"/"); err != nil {
			log.Printf("Cleanup: failed to delete MinIO objects for room %s: %v", roomID, err)
		}
		cleanupCancel()

		// Delete file metadata from MongoDB (separate context so MinIO delays don't eat into DB timeout)
		dbCtx, dbCancel := context.WithTimeout(context.Background(), 30*time.Second)
		_, err := filesCollection.DeleteMany(dbCtx, bson.M{"room_id": roomID})
		dbCancel()
		if err != nil {
			log.Printf("Cleanup: failed to delete file metadata for room %s: %v", roomID, err)
		}

		// Delete image metadata from MongoDB (separate context)
		dbCtx2, dbCancel2 := context.WithTimeout(context.Background(), 30*time.Second)
		_, err = imagesCollection.DeleteMany(dbCtx2, bson.M{"room_id": roomID})
		dbCancel2()
		if err != nil {
			log.Printf("Cleanup: failed to delete image metadata for room %s: %v", roomID, err)
		}
	}

	log.Println("Cleanup: orphaned rooms cleanup completed")
}