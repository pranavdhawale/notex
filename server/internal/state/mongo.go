package state

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var MongoClient *mongo.Client
var MongoDatabase *mongo.Database

// createIndexes creates all required indexes.
// TTL indexes are critical — if they fail, rooms/files/images will never auto-expire,
// so the server must not start without them.
func createIndexes() {
	indexCtx, indexCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer indexCancel()

	// Create TTL Index for Rooms Collection
	roomsCollection := MongoDatabase.Collection("rooms")
	roomTTLIndexModel := mongo.IndexModel{
		Keys:    bson.M{"expire_at": 1},
		Options: options.Index().SetExpireAfterSeconds(0),
	}

	_, err := roomsCollection.Indexes().CreateOne(indexCtx, roomTTLIndexModel)
	if err != nil {
		log.Fatalf("FATAL: Failed to create rooms TTL index (rooms will never auto-expire): %v", err)
	}
	log.Println("TTL Index created on rooms.expire_at")

	// Create unique index on rooms.slug for fast lookups
	slugIndexModel := mongo.IndexModel{
		Keys:    bson.M{"slug": 1},
		Options: options.Index().SetUnique(true),
	}
	_, err = roomsCollection.Indexes().CreateOne(indexCtx, slugIndexModel)
	if err != nil {
		log.Fatalf("FATAL: Failed to create rooms.slug unique index: %v", err)
	}
	log.Println("Unique Index created on rooms.slug")

	// Create TTL Index for Files Collection
	// Files expire at the same time as their parent room
	filesCollection := MongoDatabase.Collection("files")
	fileTTLIndexModel := mongo.IndexModel{
		Keys:    bson.M{"expire_at": 1},
		Options: options.Index().SetExpireAfterSeconds(0),
	}

	_, err = filesCollection.Indexes().CreateOne(indexCtx, fileTTLIndexModel)
	if err != nil {
		log.Fatalf("FATAL: Failed to create files TTL index (files will never auto-expire): %v", err)
	}
	log.Println("TTL Index created on files.expire_at")

	// Create index on files.room_id for fast file lookups
	roomIDIndexModel := mongo.IndexModel{
		Keys: bson.M{"room_id": 1},
	}
	_, err = filesCollection.Indexes().CreateOne(indexCtx, roomIDIndexModel)
	if err != nil {
		log.Printf("Warning: Failed to create files.room_id index: %v", err)
	} else {
		log.Println("Index created on files.room_id")
	}

	// Create TTL Index for Images Collection
	// Images expire at the same time as their parent room
	imagesCollection := MongoDatabase.Collection("images")
	imageTTLIndexModel := mongo.IndexModel{
		Keys:    bson.M{"expire_at": 1},
		Options: options.Index().SetExpireAfterSeconds(0),
	}

	_, err = imagesCollection.Indexes().CreateOne(indexCtx, imageTTLIndexModel)
	if err != nil {
		log.Fatalf("FATAL: Failed to create images TTL index (images will never auto-expire): %v", err)
	}
	log.Println("TTL Index created on images.expire_at")

	// Create index on images.room_id for fast image lookups
	imageRoomIDIndexModel := mongo.IndexModel{
		Keys: bson.M{"room_id": 1},
	}
	_, err = imagesCollection.Indexes().CreateOne(indexCtx, imageRoomIDIndexModel)
	if err != nil {
		log.Printf("Warning: Failed to create images.room_id index: %v", err)
	} else {
		log.Println("Index created on images.room_id")
	}

	// Create compound index for image cleanup queries
	// Used by background cleanup job: ref_count=0 AND last_used_at < threshold
	imageCleanupIndexModel := mongo.IndexModel{
		Keys: bson.D{{Key: "ref_count", Value: 1}, {Key: "last_used_at", Value: 1}},
	}
	_, err = imagesCollection.Indexes().CreateOne(indexCtx, imageCleanupIndexModel)
	if err != nil {
		log.Printf("Warning: Failed to create images.ref_count+last_used_at compound index: %v", err)
	} else {
		log.Println("Compound index created on images.ref_count + images.last_used_at")
	}
}

func InitMongo(uri string, dbName string) {
	maxRetries := 30
	retryDelay := 2 * time.Second

	var client *mongo.Client
	var err error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)

		// Configure connection pool for production workloads
		clientOptions := options.Client().
			ApplyURI(uri).
			SetMaxPoolSize(100).
			SetMinPoolSize(10).
			SetMaxConnIdleTime(30 * time.Second).
			SetConnectTimeout(10 * time.Second)

		client, err = mongo.Connect(ctx, clientOptions)
		if err != nil {
			cancel()
			log.Printf("Failed to create Mongo client (attempt %d/%d): %v", attempt, maxRetries, err)
			time.Sleep(retryDelay)
			continue
		}

		err = client.Ping(ctx, nil)
		cancel()

		if err != nil {
			log.Printf("Failed to ping Mongo (attempt %d/%d): %v", attempt, maxRetries, err)
			time.Sleep(retryDelay)
			continue
		}

		// Success!
		MongoClient = client
		MongoDatabase = client.Database(dbName)

		// Create indexes asynchronously to not block server startup
		go createIndexes()

		log.Println("Connected to MongoDB")
		return
	}

	// All retries exhausted
	log.Fatalf("Failed to connect to MongoDB after %d attempts: %v", maxRetries, err)
}

// UpdateFilesTTL updates the expire_at field for all files in a room to match the room's TTL.
// Uses $max to ensure expire_at only moves forward, preventing race conditions where
// concurrent TTL refreshes could set files to expire before their parent room.
func UpdateFilesTTL(roomID string, expireAt time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := MongoDatabase.Collection("files")
	_, err := collection.UpdateMany(
		ctx,
		bson.M{"room_id": roomID},
		bson.M{"$max": bson.M{"expire_at": expireAt}},
	)

	return err
}

// UpdateImagesTTL updates the expire_at field for all images in a room to match the room's TTL.
// Uses $max to ensure expire_at only moves forward, preventing race conditions where
// concurrent TTL refreshes could set images to expire before their parent room.
func UpdateImagesTTL(roomID string, expireAt time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := MongoDatabase.Collection("images")
	_, err := collection.UpdateMany(
		ctx,
		bson.M{"room_id": roomID},
		bson.M{"$max": bson.M{"expire_at": expireAt}},
	)

	return err
}
