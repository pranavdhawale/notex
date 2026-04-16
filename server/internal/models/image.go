package models

import "time"

// Image represents an image uploaded to a room via the editor or gallery.
// Images are tracked for garbage collection and auto-deleted when unused.
// Unlike files (user-managed, persist until manual delete), images are
// automatically cleaned up when their reference count drops to zero.
type Image struct {
	ID           string    `bson:"_id,omitempty" json:"id"`
	RoomID       string    `bson:"room_id" json:"roomId"`
	UploaderID   string    `bson:"uploader_id" json:"uploaderId"`
	Name         string    `bson:"name" json:"name"`
	Size         int64     `bson:"size" json:"size"`
	Width        int       `bson:"width" json:"width"`
	Height       int       `bson:"height" json:"height"`
	StorageKey   string    `bson:"storage_key" json:"-"`   // MinIO object key for full image
	ThumbnailKey string    `bson:"thumbnail_key" json:"-"` // MinIO object key for thumbnail
	URL          string    `bson:"-" json:"url"`           // Computed field for download URL
	ThumbnailURL string    `bson:"-" json:"thumbnailUrl"`  // Computed field for thumbnail URL
	RefCount     int       `bson:"ref_count" json:"refCount"`
	LastUsedAt   time.Time `bson:"last_used_at" json:"lastUsedAt"`
	CreatedAt    time.Time `bson:"created_at" json:"createdAt"`
	// ExpireAt is the TTL expiration time, inherited from the room.
	// - Set from room.ExpireAt when image is uploaded
	// - Updated when room TTL is refreshed (GetRoom, SaveRoom)
	// - MongoDB TTL index automatically deletes expired images
	ExpireAt time.Time `bson:"expire_at" json:"expireAt"`
	// SourceFileID tracks the original file ID when this image was created from a file
	// This prevents duplicate files when saving the image back to files
	SourceFileID string    `bson:"source_file_id,omitempty" json:"sourceFileId,omitempty"`
}