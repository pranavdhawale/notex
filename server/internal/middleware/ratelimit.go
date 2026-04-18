package middleware

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

// Metrics tracks rate limiter statistics
type Metrics struct {
	Allowed   int64
	Rejected  int64
	Total     int64
}

// RateLimiter provides in-memory rate limiting using a sliding window
type RateLimiter struct {
	requests    sync.Map // map[string]*requestCount
	maxRequests int
	windowSize  time.Duration
	metrics     Metrics
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

	// Track metrics
	atomic.AddInt64(&r.metrics.Total, 1)

	// Check if within limit
	if counter.count >= r.maxRequests {
		atomic.AddInt64(&r.metrics.Rejected, 1)
		return false
	}

	counter.count++
	atomic.AddInt64(&r.metrics.Allowed, 1)
	return true
}

// GetMetrics returns current metrics for this rate limiter
func (r *RateLimiter) GetMetrics() Metrics {
	return Metrics{
		Allowed:  atomic.LoadInt64(&r.metrics.Allowed),
		Rejected: atomic.LoadInt64(&r.metrics.Rejected),
		Total:    atomic.LoadInt64(&r.metrics.Total),
	}
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

	// Image upload: 10 per room+user per minute
	ImageUploadLimiter = NewRateLimiter(10, time.Minute)

	// Image reconcile: 30 per room+user per minute
	ImageReconcileLimiter = NewRateLimiter(30, time.Minute)

	// Image list: 60 per room+user per minute
	ImageListLimiter = NewRateLimiter(60, time.Minute)

	// Image read (raw/thumbnail): 120 per room+user per minute
	ImageReadLimiter = NewRateLimiter(120, time.Minute)

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

// RateLimitImageUpload limits image upload requests per room+user
func RateLimitImageUpload() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		userID := c.GetString("userID")

		// Key combines room and user for per-room-per-user limiting
		key := room + ":" + userID
		if !ImageUploadLimiter.Allow(key) {
			c.JSON(429, gin.H{
				"error": "Too many image uploads. Please wait a minute and try again.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitImageReconcile limits image reconciliation requests per room+user
func RateLimitImageReconcile() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		userID := c.GetString("userID")

		// Key combines room and user for per-room-per-user limiting
		key := room + ":" + userID
		if !ImageReconcileLimiter.Allow(key) {
			c.JSON(429, gin.H{
				"error": "Too many image reconcile requests. Please wait a moment.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitImageList limits image list requests per room+user
func RateLimitImageList() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		userID := c.GetString("userID")

		key := room + ":" + userID
		if !ImageListLimiter.Allow(key) {
			c.JSON(429, gin.H{
				"error": "Too many image list requests. Please wait a moment.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitImageRead limits image read (raw/thumbnail) requests per room+user
func RateLimitImageRead() gin.HandlerFunc {
	return func(c *gin.Context) {
		room := c.Param("room")
		userID := c.GetString("userID")

		key := room + ":" + userID
		if !ImageReadLimiter.Allow(key) {
			c.JSON(429, gin.H{
				"error": "Too many image requests. Please wait a moment.",
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

// AllMetrics returns metrics for all rate limiters
type AllMetrics struct {
	Upload         Metrics
	Download       Metrics
	Room           Metrics
	Save           Metrics
	Password       Metrics
	ImageUpload    Metrics
	ImageReconcile Metrics
	ImageList      Metrics
	ImageRead      Metrics
}

// GetAllMetrics returns metrics for all rate limiters
func GetAllMetrics() AllMetrics {
	return AllMetrics{
		Upload:         UploadLimiter.GetMetrics(),
		Download:       DownloadLimiter.GetMetrics(),
		Room:           RoomLimiter.GetMetrics(),
		Save:           SaveLimiter.GetMetrics(),
		Password:       PasswordLimiter.GetMetrics(),
		ImageUpload:    ImageUploadLimiter.GetMetrics(),
		ImageReconcile: ImageReconcileLimiter.GetMetrics(),
		ImageList:      ImageListLimiter.GetMetrics(),
		ImageRead:      ImageReadLimiter.GetMetrics(),
	}
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
				ImageUploadLimiter.Cleanup()
				ImageReconcileLimiter.Cleanup()
				ImageListLimiter.Cleanup()
				ImageReadLimiter.Cleanup()
			case <-shutdownCh:
				return
			}
		}
	}()
}