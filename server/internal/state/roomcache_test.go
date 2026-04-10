package state

import (
	"sync"
	"testing"
	"time"
)

func TestRoomCache_GetSet(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	// Test set and get
	info := &RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: time.Now().Add(1 * time.Hour),
	}
	cache.Set("test-room", info)

	// Verify get returns the correct info
	got := cache.Get("test-room")
	if got == nil {
		t.Fatal("expected to get room info, got nil")
	}
	if got.Exists != true {
		t.Errorf("expected Exists=true, got %v", got.Exists)
	}
	if got.Locked != false {
		t.Errorf("expected Locked=false, got %v", got.Locked)
	}
}

func TestRoomCache_GetExpired(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	// Set expired entry
	info := &RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: time.Now().Add(-1 * time.Hour), // Expired
	}
	cache.Set("expired-room", info)

	// Get should return nil for expired entry
	got := cache.Get("expired-room")
	if got != nil {
		t.Errorf("expected nil for expired entry, got %v", got)
	}
}

func TestRoomCache_GetNonExistent(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	// Get non-existent room
	got := cache.Get("nonexistent")
	if got != nil {
		t.Errorf("expected nil for non-existent room, got %v", got)
	}
}

func TestRoomCache_Delete(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	// Set entry
	info := &RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: time.Now().Add(1 * time.Hour),
	}
	cache.Set("delete-me", info)

	// Delete
	cache.Delete("delete-me")

	// Verify deleted
	got := cache.Get("delete-me")
	if got != nil {
		t.Errorf("expected nil after delete, got %v", got)
	}
}

func TestRoomCache_UpdateLock(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	// Set unlocked room
	info := &RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: time.Now().Add(1 * time.Hour),
	}
	cache.Set("lock-me", info)

	// Update to locked
	cache.UpdateLock("lock-me", true)

	// Verify locked
	got := cache.Get("lock-me")
	if got == nil {
		t.Fatal("expected to get room info, got nil")
	}
	if got.Locked != true {
		t.Errorf("expected Locked=true, got %v", got.Locked)
	}

	// Update to unlocked
	cache.UpdateLock("lock-me", false)

	// Verify unlocked
	got = cache.Get("lock-me")
	if got == nil {
		t.Fatal("expected to get room info, got nil")
	}
	if got.Locked != false {
		t.Errorf("expected Locked=false, got %v", got.Locked)
	}
}

func TestRoomCache_UpdateLockNonExistent(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	// Update lock on non-existent room should not panic
	cache.UpdateLock("nonexistent", true)

	// Verify nothing was added
	if cache.Size() != 0 {
		t.Errorf("expected cache size 0, got %d", cache.Size())
	}
}

func TestRoomCache_Cleanup(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	// Add expired entries
	cache.Set("expired1", &RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: time.Now().Add(-1 * time.Hour),
	})
	cache.Set("expired2", &RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: time.Now().Add(-2 * time.Hour),
	})

	// Add valid entry
	cache.Set("valid", &RoomInfo{
		Exists:   true,
		Locked:   false,
		ExpireAt: time.Now().Add(1 * time.Hour),
	})

	// Cleanup
	count := cache.Cleanup()
	if count != 2 {
		t.Errorf("expected to cleanup 2 entries, got %d", count)
	}

	// Verify only valid entry remains
	if cache.Size() != 1 {
		t.Errorf("expected cache size 1, got %d", cache.Size())
	}

	got := cache.Get("valid")
	if got == nil {
		t.Error("expected valid entry to remain")
	}
}

func TestRoomCache_Concurrent(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	var wg sync.WaitGroup
	numOps := 100

	// Concurrent writes
	wg.Add(numOps)
	for i := 0; i < numOps; i++ {
		go func(i int) {
			defer wg.Done()
			cache.Set("room"+string(rune(i%10)), &RoomInfo{
				Exists:   true,
				Locked:   false,
				ExpireAt: time.Now().Add(1 * time.Hour),
			})
		}(i)
	}

	// Concurrent reads
	wg.Add(numOps)
	for i := 0; i < numOps; i++ {
		go func(i int) {
			defer wg.Done()
			cache.Get("room" + string(rune(i%10)))
		}(i)
	}

	wg.Wait()
	// If we get here without race conditions, the test passes
}

func TestGetRoomCache_Singleton(t *testing.T) {
	cache1 := GetRoomCache()
	cache2 := GetRoomCache()

	if cache1 != cache2 {
		t.Error("GetRoomCache should return the same instance")
	}
}

func TestRoomCache_Size(t *testing.T) {
	cache := &RoomCache{
		rooms: make(map[string]*RoomInfo),
	}

	if cache.Size() != 0 {
		t.Errorf("expected size 0, got %d", cache.Size())
	}

	cache.Set("room1", &RoomInfo{ExpireAt: time.Now().Add(1 * time.Hour)})
	cache.Set("room2", &RoomInfo{ExpireAt: time.Now().Add(1 * time.Hour)})

	if cache.Size() != 2 {
		t.Errorf("expected size 2, got %d", cache.Size())
	}
}