package utils

import (
	"context"
	"math/rand"
	"time"

	petname "github.com/dustinkirkland/golang-petname"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

// GenerateSlug generates a human-friendly 2-word slug
// Uses adjective-noun or color-animal patterns
func GenerateSlug() string {
	// Generate 2-word combination (adjective + noun)
	// petname.Generate(words, separator)
	return petname.Generate(2, "-")
}

// GenerateUniqueSlug generates a unique slug with collision detection
// Retries up to maxAttempts times before returning an error
func GenerateUniqueSlug(ctx context.Context, collection *mongo.Collection) (string, error) {
	maxAttempts := 10

	for i := 0; i < maxAttempts; i++ {
		slug := GenerateSlug()

		// Check if slug already exists
		count, err := collection.CountDocuments(ctx, bson.M{"slug": slug})
		if err != nil {
			return "", err
		}

		// If slug is unique, return it
		if count == 0 {
			return slug, nil
		}
	}

	// If we've exhausted all attempts, return error
	// This should be extremely rare with ~10,000 combinations
	return "", mongo.ErrNoDocuments
}
