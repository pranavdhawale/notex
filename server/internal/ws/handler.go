package ws

import (
	"log"
	"net/http"
	"time"
	"context"

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
		return true // Allow all origins for v1/localhost
	},
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

	// CHECK: Verify room exists in DB
	collection := state.MongoDatabase.Collection("rooms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var room models.Room
	err := collection.FindOne(ctx, bson.M{"slug": roomID}).Decode(&room)
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

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade websocket: %v", err)
		return
	}

	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 256), roomID: roomID}
	client.hub.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go client.writePump()
	go client.readPump()
}
