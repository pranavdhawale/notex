package state

import (
	"log"
	"sync"
	"time"
)

// RoomInfo contains cached room metadata
type RoomInfo struct {
	Exists   bool
	Locked   bool
	ExpireAt time.Time
}

// RoomCache provides in-memory caching for room existence and metadata
// to avoid database lookups on every WebSocket connection.
type RoomCache struct {
	mu    sync.RWMutex
	rooms map[string]*RoomInfo
}

// globalRoomCache is the singleton instance
var globalRoomCache *RoomCache
var roomCacheOnce sync.Once

// GetRoomCache returns the global room cache instance
func GetRoomCache() *RoomCache {
	roomCacheOnce.Do(func() {
		globalRoomCache = &RoomCache{
			rooms: make(map[string]*RoomInfo),
		}
	})
	return globalRoomCache
}

// Get retrieves room info from cache. Returns nil if not cached or expired.
func (rc *RoomCache) Get(slug string) *RoomInfo {
	rc.mu.RLock()
	defer rc.mu.RUnlock()

	info, exists := rc.rooms[slug]
	if !exists {
		return nil
	}

	// Check if expired
	if time.Now().After(info.ExpireAt) {
		return nil
	}

	return info
}

// Set stores room info in cache with TTL
func (rc *RoomCache) Set(slug string, info *RoomInfo) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	rc.rooms[slug] = info
}

// Delete removes a room from cache (called when room is deleted)
func (rc *RoomCache) Delete(slug string) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	delete(rc.rooms, slug)
}

// UpdateLock updates the locked status for a cached room
func (rc *RoomCache) UpdateLock(slug string, locked bool) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	if info, exists := rc.rooms[slug]; exists {
		info.Locked = locked
	}
}

// Cleanup removes expired entries from cache
// Should be called periodically to prevent memory bloat
func (rc *RoomCache) Cleanup() int {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	now := time.Now()
	count := 0
	for slug, info := range rc.rooms {
		if now.After(info.ExpireAt) {
			delete(rc.rooms, slug)
			count++
		}
	}
	return count
}

// Size returns the number of rooms in cache (for metrics)
func (rc *RoomCache) Size() int {
	rc.mu.RLock()
	defer rc.mu.RUnlock()

	return len(rc.rooms)
}

// StartRoomCacheCleanup starts a background goroutine that periodically
// cleans up expired room cache entries.
// Returns a stop channel to gracefully shutdown the cleanup goroutine.
func StartRoomCacheCleanup(interval time.Duration) chan struct{} {
	stopCh := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				count := GetRoomCache().Cleanup()
				if count > 0 {
					log.Printf("RoomCache: cleaned up %d expired entries", count)
				}
			case <-stopCh:
				log.Println("Room cache cleanup stopped")
				return
			}
		}
	}()
	return stopCh
}