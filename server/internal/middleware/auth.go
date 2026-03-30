package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/pranavdhawale/notex/server/internal/utils"
)

// AuthRequired returns a middleware that validates session tokens
// and injects the user ID into the request context
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get token from Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>" format
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format. Use: Bearer <token>"})
			c.Abort()
			return
		}

		token := parts[1]

		// Validate token
		session, err := utils.ValidateToken(token)
		if err != nil {
			if err == utils.ErrTokenExpired {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired. Please refresh."})
			} else {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid session token"})
			}
			c.Abort()
			return
		}

		// Inject user ID into context
		c.Set("userID", session.UserID)
		c.Next()
	}
}