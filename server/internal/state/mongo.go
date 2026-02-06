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

func InitMongo(uri string, dbName string) {
	maxRetries := 30
	retryDelay := 2 * time.Second

	var client *mongo.Client
	var err error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		
		client, err = mongo.Connect(ctx, options.Client().ApplyURI(uri))
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
		log.Println("Connected to MongoDB")
		return
	}

<<<<<<< Updated upstream
	err = client.Ping(ctx, nil)
	if err != nil {
		log.Fatalf("Failed to ping Mongo: %v", err)
	}

	MongoClient = client
	MongoDatabase = client.Database(dbName)
	
	// Create TTL Index for Dynamic Expiration
	roomsCollection := MongoDatabase.Collection("rooms")
	indexModel := mongo.IndexModel{
		Keys: bson.M{"expire_at": 1},
		Options: options.Index().SetExpireAfterSeconds(0), // Expire exactly at the time specified in expire_at
	}
	_, err = roomsCollection.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		log.Printf("Failed to create TTL index: %v", err)
	} else {
		log.Println("TTL Index created on rooms.expire_at")
	}

	log.Println("Connected to MongoDB")
=======
	// All retries exhausted
	log.Fatalf("Failed to connect to MongoDB after %d attempts: %v", maxRetries, err)
>>>>>>> Stashed changes
}
