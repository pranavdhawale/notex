package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter provides in-memory rate limiting using a sliding window
type RateLimiter struct {
	requests   sync.Map // map[string]*requestCount
	maxRequests int
	windowSize  time.Duration
}

type requestCount struct {
	count      int
	windowStart time.Time
	mu         sync.Mutex
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(maxRequests int, windowSize time.Duration) *RateLimiter {
	return &RateLimiter{
		maxRequests: maxRequests,
		windowSize:  windowSize,
	}
}

// Allow checks if a request from the given key should be allowed
func (r *RateLimiter) Allow(key string) bool {
	now := time.Now()

	// Get or create counter for this key
	value, _ := r.requests.LoadOrStore(key, &requestCount{
		count:      0,
		windowStart: now,
	})

	counter := value.(*requestCount)
	counter.mu.Lock()
	defer counter.mu.Unlock()

	// Reset if window has expired
	if now.Sub(counter.windowStart) > r.windowSize {
		counter.count = 0
		counter.windowStart = now
	}

	// Check if within limit
	if counter.count >= r.maxRequests {
		return false
	}

	counter.count++
	return true
}

// Cleanup removes old entries periodically (call from a goroutine)
func (r *RateLimiter) Cleanup() {
	now := time.Now()
	r.requests.Range(func(key, value interface{}) bool {
		counter := value.(*requestCount)
		counter.mu.Lock()
		if now.Sub(counter.windowStart) > r.windowSize*2 {
			r.requests.Delete(key)
		}
		counter.mu.Unlock()
		return true
	})
}

// Global rate limiters
var (
	// Session creation: 5 per IP per minute
	SessionLimiter = NewRateLimiter(5, time.Minute)

	// File uploads: 10 per room+user per minute
	UploadLimiter = NewRateLimiter(10, time.Minute)

	// Room creation: 5 per IP per minute
	RoomLimiter = NewRateLimiter(5, time.Minute)
)

// RateLimitSession limits session creation requests per IP
func RateLimitSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !SessionLimiter.Allow(ip) {
			c.JSON(429, gin.H{
				"error": "Too many session requests. Please wait a minute and try again.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitUpload limits file upload requests per room+user
func RateLimitUpload() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		userID := c.GetString("userID")

		// Key combines room and user for per-room-per-user limiting
		key := room + ":" + userID
		if !UploadLimiter.Allow(key) {
			c.JSON(429, gin.H{
				"error": "Too many uploads for this room. Please wait a minute and try again.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitRoom limits room creation requests per IP
func RateLimitRoom() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !RoomLimiter.Allow(ip) {
			c.JSON(429, gin.H{
				"error": "Too many rooms created. Please wait a minute and try again.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// init starts cleanup goroutine
func init() {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			SessionLimiter.Cleanup()
			UploadLimiter.Cleanup()
			RoomLimiter.Cleanup()
		}
	}()
}