package utils

import (
	"context"
	"errors"
	"math/rand"
	"regexp"
	"strings"
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

// ValidateCustomSlug validates user-provided slug
// Returns error if invalid
func ValidateCustomSlug(slug string) error {
	// Check empty
	if slug == "" {
		return errors.New("slug cannot be empty")
	}

	// Check length
	if len(slug) > 50 {
		return errors.New("slug too long (max 50 characters)")
	}

	// Check format: lowercase alphanumeric + hyphens
	// Pattern: word or word-word (no leading/trailing hyphens, no consecutive hyphens)
	matched, _ := regexp.MatchString("^[a-z0-9]+(-[a-z0-9]+)?$", slug)
	if !matched {
		return errors.New("slug must be lowercase alphanumeric with optional single hyphen")
	}

	// Count words (split by hyphen)
	words := strings.Split(slug, "-")
	if len(words) > 2 {
		return errors.New("slug can have maximum 2 words")
	}

	// Check minimum word length (at least 2 characters per word)
	for _, word := range words {
		if len(word) < 2 {
			return errors.New("each word must be at least 2 characters")
		}
	}

	return nil
}

