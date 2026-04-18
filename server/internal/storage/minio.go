package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinIOClient wraps the MinIO client with our configuration
type MinIOClient struct {
	client *minio.Client
	bucket string
}

// NewMinIOClient creates a new MinIO client connection
func NewMinIOClient(endpoint, accessKey, secretKey string, useSSL bool, bucket string) (*MinIOClient, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}

	return &MinIOClient{
		client: client,
		bucket: bucket,
	}, nil
}

// EnsureBucket creates the bucket if it doesn't exist
func (m *MinIOClient) EnsureBucket(ctx context.Context) error {
	exists, err := m.client.BucketExists(ctx, m.bucket)
	if err != nil {
		return err
	}

	if !exists {
		err = m.client.MakeBucket(ctx, m.bucket, minio.MakeBucketOptions{})
		if err != nil {
			return err
		}
		log.Printf("Created MinIO bucket: %s", m.bucket)
	}

	return nil
}

// Upload streams a file to MinIO storage
func (m *MinIOClient) Upload(ctx context.Context, objectName string, reader io.Reader, size int64, contentType string) error {
	_, err := m.client.PutObject(ctx, m.bucket, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	return err
}

// Download returns a reader for a file from MinIO storage
func (m *MinIOClient) Download(ctx context.Context, objectName string) (io.ReadCloser, error) {
	obj, err := m.client.GetObject(ctx, m.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	return obj, nil
}

// Delete removes a file from MinIO storage
func (m *MinIOClient) Delete(ctx context.Context, objectName string) error {
	return m.client.RemoveObject(ctx, m.bucket, objectName, minio.RemoveObjectOptions{})
}

// DeleteByPrefix removes all files with a given prefix (e.g., all files in a room)
// Uses streaming to avoid memory bloat - pipes ListObjects directly to RemoveObjects
func (m *MinIOClient) DeleteByPrefix(ctx context.Context, prefix string) error {
	// List objects with prefix
	objectsCh := m.client.ListObjects(ctx, m.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	// Pipe objects directly to RemoveObjects channel (streaming, no memory accumulation)
	deleteCh := make(chan minio.ObjectInfo)
	var listErr error

	go func() {
		defer close(deleteCh)
		for obj := range objectsCh {
			if obj.Err != nil {
				listErr = obj.Err
				return
			}
			deleteCh <- obj
		}
	}()

	// Collect errors from batch deletion
	errorCh := m.client.RemoveObjects(ctx, m.bucket, deleteCh, minio.RemoveObjectsOptions{})
	for err := range errorCh {
		if err.Err != nil {
			log.Printf("Warning: failed to delete object %s: %v", err.ObjectName, err.Err)
		}
	}

	return listErr
}

// DeleteBatch removes multiple files in a single batch operation.
// Returns nil if all deletions succeed, or an aggregated error with per-object details.
// Callers can inspect the error message to identify which specific objects failed
// and decide whether to proceed with metadata deletion.
func (m *MinIOClient) DeleteBatch(ctx context.Context, objectNames []string) error {
	if len(objectNames) == 0 {
		return nil
	}

	// Create ObjectInfo channel for batch deletion
	deleteCh := make(chan minio.ObjectInfo, len(objectNames))
	go func() {
		for _, name := range objectNames {
			deleteCh <- minio.ObjectInfo{Key: name}
		}
		close(deleteCh)
	}()

	errorCh := m.client.RemoveObjects(ctx, m.bucket, deleteCh, minio.RemoveObjectsOptions{})

	var failedObjects []string
	for err := range errorCh {
		if err.Err != nil {
			log.Printf("Warning: failed to delete object %s: %v", err.ObjectName, err.Err)
			failedObjects = append(failedObjects, err.ObjectName)
		}
	}

	if len(failedObjects) > 0 {
		return fmt.Errorf("DeleteBatch: %d of %d objects failed: %s",
			len(failedObjects), len(objectNames), strings.Join(failedObjects, ", "))
	}
	return nil
}

// Copy duplicates an object within the same bucket from srcKey to dstKey.
// Uses MinIO's server-side copy — no data is downloaded/uploaded through the client.
func (m *MinIOClient) Copy(ctx context.Context, srcKey, dstKey string, size int64, contentType string) error {
	src := minio.CopySrcOptions{Bucket: m.bucket, Object: srcKey}
	dst := minio.CopyDestOptions{
		Bucket:      m.bucket,
		Object:      dstKey,
		Size:        size,
		ContentType: contentType,
	}

	_, err := m.client.CopyObject(ctx, dst, src)
	return err
}

// ListObjectPrefixes returns all unique top-level prefixes (room IDs) in the bucket.
// Used by garbage collection to find orphaned MinIO objects.
func (m *MinIOClient) ListObjectPrefixes(ctx context.Context) ([]string, error) {
	var prefixes []string
	seen := make(map[string]bool)

	objectsCh := m.client.ListObjects(ctx, m.bucket, minio.ListObjectsOptions{
		Prefix:    "",
		Recursive: false,
	})

	for obj := range objectsCh {
		if obj.Err != nil {
			return nil, obj.Err
		}
		// Object keys look like "roomSlug/uuid.ext"
		// Extract the prefix (room slug) before the first /
		idx := strings.Index(obj.Key, "/")
		if idx > 0 {
			prefix := obj.Key[:idx]
			if !seen[prefix] {
				seen[prefix] = true
				prefixes = append(prefixes, prefix)
			}
		}
	}

	return prefixes, nil
}

// Stat returns object info (used to check if file exists)
func (m *MinIOClient) Stat(ctx context.Context, objectName string) (minio.ObjectInfo, error) {
	return m.client.StatObject(ctx, m.bucket, objectName, minio.StatObjectOptions{})
}