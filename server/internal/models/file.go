package models

import "time"

// File represents a file uploaded to a room.
// Files inherit TTL from their parent room and expire at the same time.
type File struct {
	ID         string    `bson:"_id,omitempty" json:"id"`
	RoomID     string    `bson:"room_id" json:"roomId"`
	UploaderID string    `bson:"uploader_id" json:"uploaderId"`
	Name       string    `bson:"name" json:"name"`
	Size       int64     `bson:"size" json:"size"`
	StorageKey string    `bson:"storage_key" json:"-"` // MinIO object key
	URL        string    `bson:"-" json:"url"`         // Computed field for download URL
	CreatedAt  time.Time `bson:"created_at" json:"createdAt"`
	// ExpireAt is the TTL expiration time, inherited from the room.
	// - Set from room.ExpireAt when file is uploaded
	// - Updated when room TTL is refreshed (GetRoom, SaveRoom)
	// - MongoDB TTL index automatically deletes expired files
	ExpireAt time.Time `bson:"expire_at" json:"expireAt"`
}
