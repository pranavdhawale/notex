package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// AuthRequired returns a middleware that extracts user ID from X-User-ID header
// For anonymous applications, we trust the client-provided user ID
// Security is provided by the fact that user IDs are UUIDs that are hard to guess
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetHeader("X-User-ID")
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "X-User-ID header required"})
			c.Abort()
			return
		}

		// Inject user ID into context
		c.Set("userID", userID)
		c.Next()
	}
}