package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"github.com/pranavdhawale/notex/server/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// VerifyPasswordRequest is the request body for password verification
type VerifyPasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

// VerifyPasswordResponse is the response for successful password verification
type VerifyPasswordResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expiresIn"` // seconds
}

// LockRoomRequest is the request body for locking a room
type LockRoomRequest struct {
	Password     string `json:"password"`     // Current password (required if room already locked)
	NewPassword  string `json:"newPassword"`  // New password to set
}

// UnlockRoomRequest is the request body for unlocking a room
type UnlockRoomRequest struct {
	Password string `json:"password" binding:"required"`
}

// VerifyPassword handles POST /api/rooms/:room/verify-password
// Returns a session token if password is correct
func VerifyPassword(c *gin.Context) {
	slug := c.Param("room")
	userID := c.GetHeader("X-User-ID")

	var req VerifyPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required"})
		return
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var room models.Room
	err := collection.FindOne(ctx, bson.M{"slug": slug}).Decode(&room)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			// Don't reveal if room exists or not
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password or room does not exist"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Check if room is locked
	if !room.Locked {
		// Room is not locked, shouldn't be hitting this endpoint
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room is not locked"})
		return
	}

	// Verify password
	valid, err := utils.VerifyPassword(req.Password, room.PasswordHash)
	if err != nil || !valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password or room does not exist"})
		return
	}

	// Generate auth token
	token, err := state.AuthTokens.Generate(slug, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, VerifyPasswordResponse{
		Token:     token,
		ExpiresIn: 3600, // 1 hour
	})
}

// LockRoom handles PUT /api/rooms/:room/lock
// Owner sets a password to lock the room
func LockRoom(c *gin.Context) {
	slug := c.Param("room")
	userID := c.GetString("userID")

	var req LockRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Request body is required"})
		return
	}

	if req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "New password is required"})
		return
	}

	// Validate password length
	if len(req.NewPassword) < 4 || len(req.NewPassword) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be between 4 and 100 characters"})
		return
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var room models.Room
	err := collection.FindOne(ctx, bson.M{"slug": slug}).Decode(&room)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Check ownership
	if room.Owner != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only room owner can lock this room"})
		return
	}

	// If room is already locked, verify current password
	if room.Locked && room.PasswordHash != "" {
		if req.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Current password is required to change password"})
			return
		}
		valid, err := utils.VerifyPassword(req.Password, room.PasswordHash)
		if err != nil || !valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
			return
		}
	}

	// Hash new password
	passwordHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	// Update room
	_, err = collection.UpdateOne(ctx,
		bson.M{"slug": slug},
		bson.M{"$set": bson.M{
			"password_hash": passwordHash,
			"locked":        true,
		}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to lock room"})
		return
	}

	// Generate auth token for the owner so they don't need to re-enter password
	token, err := state.AuthTokens.Generate(slug, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"token":     token,
		"expiresIn": 3600,
	})
}

// UnlockRoom handles PUT /api/rooms/:room/unlock
// Owner removes the password to unlock the room
func UnlockRoom(c *gin.Context) {
	slug := c.Param("room")
	userID := c.GetString("userID")

	var req UnlockRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required"})
		return
	}

	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var room models.Room
	err := collection.FindOne(ctx, bson.M{"slug": slug}).Decode(&room)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Check ownership
	if room.Owner != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only room owner can unlock this room"})
		return
	}

	// Check if room is locked
	if !room.Locked {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room is not locked"})
		return
	}

	// Verify password
	valid, err := utils.VerifyPassword(req.Password, room.PasswordHash)
	if err != nil || !valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Password is incorrect"})
		return
	}

	// Update room - clear password and locked status
	_, err = collection.UpdateOne(ctx,
		bson.M{"slug": slug},
		bson.M{"$set": bson.M{
			"password_hash": "",
			"locked":        false,
		}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlock room"})
		return
	}

	// Purge all auth tokens for this room
	state.AuthTokens.DeleteAllForRoom(slug)

	c.JSON(http.StatusOK, gin.H{"success": true})
}