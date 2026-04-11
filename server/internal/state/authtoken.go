package state

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"sync"
	"time"
)

// AuthToken represents a session token for locked room access
type AuthToken struct {
	RoomSlug string
	UserID   string
	Expires  time.Time
}

// TokenStore manages in-memory auth tokens with TTL
type TokenStore struct {
	mu     sync.RWMutex
	tokens map[string]*AuthToken

	// Channel for graceful shutdown
	stopCh chan struct{}
}

// Global token store
var AuthTokens = NewTokenStore()

func NewTokenStore() *TokenStore {
	store := &TokenStore{
		tokens: make(map[string]*AuthToken),
		stopCh: make(chan struct{}),
	}
	// Start cleanup goroutine with graceful shutdown
	go store.cleanup()
	return store
}

// Generate creates a new auth token for a room
func (s *TokenStore) Generate(roomSlug, userID string) (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	token := base64.URLEncoding.EncodeToString(bytes)

	s.mu.Lock()
	s.tokens[token] = &AuthToken{
		RoomSlug: roomSlug,
		UserID:   userID,
		Expires:  time.Now().Add(time.Hour),
	}
	s.mu.Unlock()

	return token, nil
}

// Validate checks if a token is valid and returns the associated room slug
// Tokens are multi-use within their validity window to support WebSocket reconnection
func (s *TokenStore) Validate(token string) (roomSlug string, userID string, valid bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	auth, exists := s.tokens[token]
	if !exists {
		return "", "", false
	}

	// Check expiration
	if time.Now().After(auth.Expires) {
		return "", "", false
	}

	// Token is valid - return info without consuming
	// This allows WebSocket reconnections to use the same token
	return auth.RoomSlug, auth.UserID, true
}

// Delete removes a specific token
func (s *TokenStore) Delete(token string) {
	s.mu.Lock()
	delete(s.tokens, token)
	s.mu.Unlock()
}

// DeleteAllForRoom removes all tokens for a specific room
func (s *TokenStore) DeleteAllForRoom(roomSlug string) {
	s.mu.Lock()
	for token, auth := range s.tokens {
		if auth.RoomSlug == roomSlug {
			delete(s.tokens, token)
		}
	}
	s.mu.Unlock()
}

// Shutdown stops the cleanup goroutine
func (s *TokenStore) Shutdown() {
	close(s.stopCh)
}

// cleanup removes expired tokens periodically with graceful shutdown
func (s *TokenStore) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.mu.Lock()
			now := time.Now()
			for token, auth := range s.tokens {
				if now.After(auth.Expires) {
					delete(s.tokens, token)
				}
			}
			s.mu.Unlock()
		case <-s.stopCh:
			log.Println("Token store cleanup stopped")
			return
		}
	}
}