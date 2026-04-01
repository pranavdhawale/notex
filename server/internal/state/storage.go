package state

import (
	"log"
	"os"

	"github.com/pranavdhawale/notex/server/internal/storage"
)

// MinIOClient is the global MinIO storage client
var MinIOClient *storage.MinIOClient

// InitMinIO initializes the MinIO storage client
func InitMinIO() {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}

	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")

	// In production, credentials must be explicitly configured
	if os.Getenv("GIN_MODE") == "release" {
		if accessKey == "" || secretKey == "" {
			log.Fatal("MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set in production mode")
		}
	} else {
		// Development defaults only
		if accessKey == "" {
			accessKey = "minioadmin"
		}
		if secretKey == "" {
			secretKey = "minioadmin123"
		}
	}

	useSSL := os.Getenv("MINIO_USE_SSL") == "true"

	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "notex-uploads"
	}

	var err error
	MinIOClient, err = storage.NewMinIOClient(endpoint, accessKey, secretKey, useSSL, bucket)
	if err != nil {
		log.Fatalf("Failed to connect to MinIO: %v", err)
	}

	log.Printf("Connected to MinIO at %s, bucket: %s", endpoint, bucket)
}