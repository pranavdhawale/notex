package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"os"
	"strings"
	"time"
)

// Session represents the data stored in a session token
type Session struct {
	UserID    string `json:"uid"`
	CreatedAt int64  `json:"iat"`
}

var (
	ErrInvalidToken     = errors.New("invalid session token")
	ErrTokenExpired     = errors.New("session token expired")
	ErrInvalidSignature = errors.New("invalid token signature")
	ErrMissingSecret    = errors.New("SESSION_SECRET not configured")
)

// getSessionSecret returns the secret key for signing tokens
func getSessionSecret() ([]byte, error) {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		// In development mode, use a default secret with a warning
		if os.Getenv("GIN_MODE") != "release" {
			log.Println("WARNING: Using default SESSION_SECRET. Set SESSION_SECRET environment variable in production!")
			secret = "dev-secret-key-do-not-use-in-production-32ch"
		} else {
			return nil, ErrMissingSecret
		}
	}
	return []byte(secret), nil
}

// GenerateToken creates a signed session token for a user
func GenerateToken(userID string) (string, error) {
	secret, err := getSessionSecret()
	if err != nil {
		return "", err
	}

	session := Session{
		UserID:    userID,
		CreatedAt: time.Now().Unix(),
	}

	// Encode session data
	payload, err := json.Marshal(session)
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payload)

	// Generate signature
	signature := sign(secret, payloadB64)
	signatureB64 := base64.RawURLEncoding.EncodeToString(signature)

	// Token format: payload.signature
	return payloadB64 + "." + signatureB64, nil
}

// ValidateToken validates a session token and returns the session data
func ValidateToken(token string) (*Session, error) {
	secret, err := getSessionSecret()
	if err != nil {
		return nil, err
	}

	// Split token into payload and signature
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, ErrInvalidToken
	}

	payloadB64, signatureB64 := parts[0], parts[1]

	// Decode signature
	signature, err := base64.RawURLEncoding.DecodeString(signatureB64)
	if err != nil {
		return nil, ErrInvalidToken
	}

	// Verify signature
	expectedSignature := sign(secret, payloadB64)
	if !hmac.Equal(signature, expectedSignature) {
		return nil, ErrInvalidSignature
	}

	// Decode payload
	payload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, ErrInvalidToken
	}

	// Unmarshal session
	var session Session
	if err := json.Unmarshal(payload, &session); err != nil {
		return nil, ErrInvalidToken
	}

	// Check expiration (30 days)
	maxAge := int64(30 * 24 * 60 * 60) // 30 days in seconds
	if time.Now().Unix()-session.CreatedAt > maxAge {
		return nil, ErrTokenExpired
	}

	return &session, nil
}

// sign creates an HMAC-SHA256 signature
func sign(secret []byte, data string) []byte {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(data))
	return h.Sum(nil)
}

// GenerateUserID creates a new unique user ID
func GenerateUserID() string {
	return "user_" + generateRandomString(12)
}

func generateRandomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[time.Now().UnixNano()%int64(len(charset))]
	}
	return string(b)
}