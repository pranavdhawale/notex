package models

import "time"

type File struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	RoomID    string    `bson:"room_id" json:"roomId"`
	UploaderID string   `bson:"uploader_id" json:"uploaderId"`
	Name      string    `bson:"name" json:"name"`
	Size      int64     `bson:"size" json:"size"`
	Path      string    `bson:"path" json:"-"`
	URL       string    `bson:"-" json:"url"` // Computed field
	CreatedAt time.Time `bson:"created_at" json:"createdAt"`
}
