package ws

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pranavdhawale/notex/server/internal/models"
	"github.com/pranavdhawale/notex/server/internal/state"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")

		// Check against cached allowed origins
		allowedOrigins := getAllowedOrigins()
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				return true
			}
			// Also allow the origin without trailing slash
			if strings.TrimSuffix(origin, "/") == strings.TrimSuffix(allowed, "/") {
				return true
			}
		}

		// In development mode, allow localhost variations
		if isDevelopment() {
			if strings.HasPrefix(origin, "http://localhost") ||
				strings.HasPrefix(origin, "http://127.0.0.1") {
				return true
			}
		}

		log.Printf("WebSocket connection rejected from origin: %s", origin)
		return false
	},
}

// Cached allowed origins - initialized once at startup
var (
	allowedOriginsCache     []string
	allowedOriginsCacheOnce sync.Once
	isDevelopmentMode       bool
)

// getAllowedOrigins returns cached allowed origins
func getAllowedOrigins() []string {
	allowedOriginsCacheOnce.Do(func() {
		allowedOriginsEnv := os.Getenv("ALLOWED_ORIGINS")
		if allowedOriginsEnv == "" {
			clientOrigin := os.Getenv("CLIENT_ORIGIN")
			if clientOrigin == "" {
				clientOrigin = "http://localhost:5173"
			}
			allowedOriginsEnv = clientOrigin
		}
		allowedOriginsCache = strings.Split(allowedOriginsEnv, ",")
		for i, origin := range allowedOriginsCache {
			allowedOriginsCache[i] = strings.TrimSpace(origin)
		}
	})
	return allowedOriginsCache
}

// isDevelopment returns true if running in development mode
func isDevelopment() bool {
	allowedOriginsCacheOnce.Do(func() {
		isDevelopmentMode = os.Getenv("GIN_MODE") != "release"
	})
	return isDevelopmentMode
}

// Main Hub instance (singleton for now)
var MainHub = NewHub()

func ServeWs(hub *Hub, c *gin.Context) {
	roomID := c.Query("room")
	if roomID == "" {
		roomID = c.Param("room")
	}
	if roomID == "" {
		log.Println("No room ID provided in WS connection")
		http.Error(c.Writer, "Room ID is required", http.StatusBadRequest)
		return
	}

	// Extract userID from query parameter (for presence tracking)
	// This is optional - the userID is also sent via X-User-ID header in HTTP requests
	_ = c.Query("userID") // Currently unused but available for future features

	// CHECK: Verify room exists (use cache first, fallback to DB)
	roomCache := state.GetRoomCache()
	cachedInfo := roomCache.Get(roomID)

	var room models.Room
	var locked bool

	if cachedInfo != nil {
		// Cache hit - use cached data
		locked = cachedInfo.Locked
	} else {
		// Cache miss - query database
		collection := state.MongoDatabase.Collection("rooms")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

		err := collection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
		cancel()

		if err != nil {
			if err == mongo.ErrNoDocuments {
				log.Printf("Attempt to connect to non-existent room: %s", roomID)
				http.Error(c.Writer, "Room not found", http.StatusNotFound)
				return
			}
			log.Printf("Database error checking room %s: %v", roomID, err)
			http.Error(c.Writer, "Internal server error", http.StatusInternalServerError)
			return
		}

		locked = room.Locked

		// Cache the result for future connections
		roomCache.Set(roomID, &state.RoomInfo{
			Exists:   true,
			Locked:   room.Locked,
			ExpireAt: room.ExpireAt,
		})
	}

	// CHECK: If room is locked, validate auth token
	if locked {
		authToken := c.Query("authToken")
		if authToken == "" {
			log.Printf("Attempt to connect to locked room without token: %s", roomID)
			http.Error(c.Writer, "Room is locked. Authentication required.", http.StatusUnauthorized)
			return
		}

		// Validate token
		tokenRoomSlug, _, valid := state.AuthTokens.Validate(authToken)
		if !valid || tokenRoomSlug != roomID {
			log.Printf("Invalid or expired token for locked room: %s", roomID)
			http.Error(c.Writer, "Invalid or expired authentication token", http.StatusUnauthorized)
			return
		}
		// Token is valid and multi-use (supports WebSocket reconnection within 1-hour window)
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade websocket: %v", err)
		return
	}

	// Use the constant buffer size defined in client.go
	client := &Client{hub: hub, conn: conn, send: make(chan []byte, clientSendBufferSize), roomID: roomID}
	client.hub.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go client.writePump()
	go client.readPump()
}