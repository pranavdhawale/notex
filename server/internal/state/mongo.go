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

// createIndexes creates all required indexes asynchronously
// This is called in a goroutine after successful connection
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
		log.Printf("Warning: Failed to create rooms TTL index: %v", err)
	} else {
		log.Println("TTL Index created on rooms.expire_at")
	}

	// Create unique index on rooms.slug for fast lookups
	slugIndexModel := mongo.IndexModel{
		Keys:    bson.M{"slug": 1},
		Options: options.Index().SetUnique(true),
	}
	_, err = roomsCollection.Indexes().CreateOne(indexCtx, slugIndexModel)
	if err != nil {
		log.Printf("Warning: Failed to create rooms.slug index: %v", err)
	} else {
		log.Println("Unique Index created on rooms.slug")
	}

	// Create TTL Index for Files Collection
	// Files expire at the same time as their parent room
	filesCollection := MongoDatabase.Collection("files")
	fileTTLIndexModel := mongo.IndexModel{
		Keys:    bson.M{"expire_at": 1},
		Options: options.Index().SetExpireAfterSeconds(0),
	}

	_, err = filesCollection.Indexes().CreateOne(indexCtx, fileTTLIndexModel)
	if err != nil {
		log.Printf("Warning: Failed to create files TTL index: %v", err)
	} else {
		log.Println("TTL Index created on files.expire_at")
	}

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
// This ensures files expire at the same time as their parent room.
// Called when room TTL is refreshed (GetRoom, SaveRoom) to keep file TTL in sync.
func UpdateFilesTTL(roomID string, expireAt time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := MongoDatabase.Collection("files")
	_, err := collection.UpdateMany(
		ctx,
		bson.M{"room_id": roomID},
		bson.M{"$set": bson.M{"expire_at": expireAt}},
	)

	return err
}
