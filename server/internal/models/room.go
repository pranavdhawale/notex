package models

import "time"

type Room struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	Slug      string    `bson:"slug" json:"slug"`
	Owner     string    `bson:"owner" json:"owner"`       // Ideally a session ID or similar for v1
	Content   interface{} `bson:"content,omitempty" json:"content,omitempty"`
	CreatedAt time.Time   `bson:"created_at" json:"createdAt"`
	ExpireAt  time.Time   `bson:"expire_at" json:"expireAt"`
}
