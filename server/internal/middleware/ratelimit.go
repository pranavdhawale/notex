package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter provides in-memory rate limiting using a sliding window
type RateLimiter struct {
	requests    sync.Map // map[string]*requestCount
	maxRequests int
	windowSize  time.Duration
}

type requestCount struct {
	count       int
	windowStart time.Time
	mu          sync.Mutex
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
		count:       0,
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

// Cleanup removes old entries periodically
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
	// File uploads: 10 per room+user per minute
	UploadLimiter = NewRateLimiter(10, time.Minute)

	// File downloads: 30 per room+user per minute (higher limit for downloads)
	DownloadLimiter = NewRateLimiter(30, time.Minute)

	// Room creation: 5 per IP per minute
	RoomLimiter = NewRateLimiter(5, time.Minute)

	// Room save: 30 per room per minute (auto-save is frequent)
	SaveLimiter = NewRateLimiter(30, time.Minute)

	// Password verification: 5 attempts per IP+room per minute
	PasswordLimiter = NewRateLimiter(5, time.Minute)

	// Shutdown channel for cleanup goroutine
	shutdownCh = make(chan struct{})
)

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

// RateLimitSave limits room save requests per room
func RateLimitSave() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		if !SaveLimiter.Allow(room) {
			c.JSON(429, gin.H{
				"error": "Too many save requests. Please wait a moment.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitPassword limits password verification attempts per IP+room
func RateLimitPassword() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		ip := c.ClientIP()

		// Key combines IP and room to limit per-room-per-IP
		key := ip + ":" + room
		if !PasswordLimiter.Allow(key) {
			c.JSON(429, gin.H{
				"error": "Too many password attempts. Please wait a minute and try again.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitDownload limits file download requests per room+user
func RateLimitDownload() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		userID := c.GetString("userID")

		// Key combines room and user for per-room-per-user limiting
		// Falls back to IP if userID is not set
		key := room + ":" + userID
		if userID == "" {
			key = room + ":" + c.ClientIP()
		}

		if !DownloadLimiter.Allow(key) {
			c.JSON(429, gin.H{
				"error": "Too many downloads for this room. Please wait a moment and try again.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// Shutdown stops the cleanup goroutine
func Shutdown() {
	close(shutdownCh)
}

// init starts cleanup goroutine with proper shutdown handling
func init() {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				UploadLimiter.Cleanup()
				DownloadLimiter.Cleanup()
				RoomLimiter.Cleanup()
				SaveLimiter.Cleanup()
				PasswordLimiter.Cleanup()
			case <-shutdownCh:
				return
			}
		}
	}()
}