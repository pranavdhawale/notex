package cleanup

import (
	"context"
	"log"
	"time"

	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
)

// StartMinIOGCJob starts a background goroutine that periodically scans
// MinIO for object prefixes (room IDs) that no longer exist in the rooms
// collection and deletes them. This is the last line of defense against
// orphaned MinIO objects after MongoDB TTL deletes all metadata.
// Returns a stop channel to gracefully shutdown the goroutine.
func StartMinIOGCJob(interval time.Duration) chan struct{} {
	stopCh := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				runMinIOGC()
			case <-stopCh:
				log.Println("MinIO GC job stopped")
				return
			}
		}
	}()
	return stopCh
}

// runMinIOGC scans MinIO for object prefixes that don't have a corresponding
// room in MongoDB and deletes them.
func runMinIOGC() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	// List all room prefixes in MinIO
	prefixes, err := state.MinIOClient.ListObjectPrefixes(ctx)
	if err != nil {
		log.Printf("MinIO GC: failed to list object prefixes: %v", err)
		return
	}

	if len(prefixes) == 0 {
		return
	}

	log.Printf("MinIO GC: scanning %d prefixes", len(prefixes))

	// Check which prefixes have a corresponding room in MongoDB
	roomsCollection := state.MongoDatabase.Collection("rooms")

	cursor, err := roomsCollection.Find(ctx, bson.M{"slug": bson.M{"$in": prefixes}})
	if err != nil {
		log.Printf("MinIO GC: failed to query rooms: %v", err)
		return
	}
	defer cursor.Close(ctx)

	// Build set of existing room slugs
	existingSlugs := make(map[string]bool)
	for cursor.Next(ctx) {
		var room struct {
			Slug string `bson:"slug"`
		}
		if err := cursor.Decode(&room); err == nil {
			existingSlugs[room.Slug] = true
		}
	}

	// Find orphaned prefixes
	var orphanedPrefixes []string
	for _, prefix := range prefixes {
		if !existingSlugs[prefix] {
			orphanedPrefixes = append(orphanedPrefixes, prefix)
		}
	}

	if len(orphanedPrefixes) == 0 {
		log.Println("MinIO GC: no orphaned prefixes found")
		return
	}

	log.Printf("MinIO GC: found %d orphaned prefixes to clean", len(orphanedPrefixes))

	// Delete orphaned prefixes from MinIO
	for _, prefix := range orphanedPrefixes {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := state.MinIOClient.DeleteByPrefix(cleanupCtx, prefix+"/"); err != nil {
			log.Printf("MinIO GC: failed to delete prefix %s: %v", prefix, err)
		} else {
			log.Printf("MinIO GC: deleted orphaned prefix: %s", prefix)
		}
		cleanupCancel()
	}

	log.Println("MinIO GC: completed")
}