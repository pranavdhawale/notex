package ws

import (
	"log"
	"sync"
	"sync/atomic"
)

const (
	// Maximum size of awareness cache per room (prevents unbounded memory growth)
	maxAwarenessPerRoom = 100
	// Maximum size of awareness message in bytes
	maxAwarenessMessageSize = 1024
)

// Metrics for monitoring
type HubMetrics struct {
	MessagesDropped   int64
	ClientsConnected   int64
	RoomsActive       int64
}

type Hub struct {
	// Registered clients by room
	rooms map[string]map[*Client]bool

	// Awareness cache: roomID -> client -> last_awareness_message
	awareness map[string]map[*Client][]byte

	// Inbound messages from the clients
	broadcast chan *Message

	// Register requests from the clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Lock for rooms map
	mu sync.RWMutex

	// Stop channel for graceful shutdown
	stopCh chan struct{}

	// Metrics
	metrics HubMetrics
}

type Message struct {
	RoomID  string
	Sender  *Client
	Content []byte
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		awareness:  make(map[string]map[*Client][]byte),
		broadcast:  make(chan *Message, 1000), // Buffered for performance
		register:   make(chan *Client, 100),   // Buffered for performance
		unregister: make(chan *Client, 100),   // Buffered for performance
		stopCh:     make(chan struct{}),
	}
}

// GetMetrics returns current hub metrics (thread-safe)
func (h *Hub) GetMetrics() HubMetrics {
	return HubMetrics{
		MessagesDropped: atomic.LoadInt64(&h.metrics.MessagesDropped),
		ClientsConnected: atomic.LoadInt64(&h.metrics.ClientsConnected),
		RoomsActive:     atomic.LoadInt64(&h.metrics.RoomsActive),
	}
}

func (h *Hub) CloseRoom(roomID string) {
	h.mu.Lock()

	if clients, ok := h.rooms[roomID]; ok {
		for client := range clients {
			close(client.send)
			delete(h.rooms[roomID], client)
		}
		delete(h.rooms, roomID)
		delete(h.awareness, roomID)
		h.mu.Unlock()
		log.Printf("Room closed: %s", roomID)
	} else {
		h.mu.Unlock()
	}
}

func (h *Hub) Run() {
	for {
		select {
		case <-h.stopCh:
			// Graceful shutdown - close all client connections
			h.mu.Lock()
			for _, clients := range h.rooms {
				for client := range clients {
					close(client.send)
				}
			}
			h.rooms = make(map[string]map[*Client]bool)
			h.awareness = make(map[string]map[*Client][]byte)
			h.mu.Unlock()
			log.Println("Hub shutdown complete")
			return

		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.rooms[client.roomID]; !ok {
				h.rooms[client.roomID] = make(map[*Client]bool)
				h.awareness[client.roomID] = make(map[*Client][]byte)
			}
			h.rooms[client.roomID][client] = true
			atomic.AddInt64(&h.metrics.ClientsConnected, 1)

			// Send existing awareness states to the new client
			if states, ok := h.awareness[client.roomID]; ok {
				for _, state := range states {
					select {
					case client.send <- state:
					default:
						// Buffer full, skip this state (non-critical awareness data)
						atomic.AddInt64(&h.metrics.MessagesDropped, 1)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("Client registered to room: %s (total clients: %d)", client.roomID, atomic.LoadInt64(&h.metrics.ClientsConnected))

		case client := <-h.unregister:
			h.mu.Lock()
			var roomIsEmpty bool
			if _, ok := h.rooms[client.roomID]; ok {
				if _, ok := h.rooms[client.roomID][client]; ok {
					delete(h.rooms[client.roomID], client)
					atomic.AddInt64(&h.metrics.ClientsConnected, -1)

					// Remove from awareness cache too
					if _, ok := h.awareness[client.roomID]; ok {
						delete(h.awareness[client.roomID], client)
					}

					close(client.send)
					// Cleanup room if empty
					roomIsEmpty = len(h.rooms[client.roomID]) == 0
					if roomIsEmpty {
						delete(h.rooms, client.roomID)
						delete(h.awareness, client.roomID)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("Client unregistered from room: %s", client.roomID)

		case message := <-h.broadcast:
			h.mu.Lock() // Use Write Lock for map updates

			// Detect Awareness Message (Type 1)
			if len(message.Content) > 0 && message.Content[0] == 1 {
				// Limit awareness message size to prevent memory bloat
				if len(message.Content) > maxAwarenessMessageSize {
					log.Printf("Awareness message too large (%d bytes), skipping", len(message.Content))
					h.mu.Unlock()
					continue
				}

				if _, ok := h.awareness[message.RoomID]; !ok {
					h.awareness[message.RoomID] = make(map[*Client][]byte)
				}

				// Limit awareness cache size per room to prevent unbounded growth
				if len(h.awareness[message.RoomID]) >= maxAwarenessPerRoom {
					// Remove oldest entry (first in map iteration)
					for k := range h.awareness[message.RoomID] {
						delete(h.awareness[message.RoomID], k)
						break
					}
				}

				// Make a copy of the slice to ensure persistence
				contentCopy := make([]byte, len(message.Content))
				copy(contentCopy, message.Content)

				h.awareness[message.RoomID][message.Sender] = contentCopy
			}

			clients, ok := h.rooms[message.RoomID]
			h.mu.Unlock()

			if ok {
				for client := range clients {
					// Don't send back to sender
					if client == message.Sender {
						continue
					}

					select {
					case client.send <- message.Content:
					default:
						// Client buffer full, message dropped (client may be slow/disconnected)
						atomic.AddInt64(&h.metrics.MessagesDropped, 1)
						log.Printf("Client buffer full in room %s, dropping message (total dropped: %d)", message.RoomID, atomic.LoadInt64(&h.metrics.MessagesDropped))
					}
				}
			}
		}
	}
}

// Stop gracefully shuts down the hub
func (h *Hub) Stop() {
	close(h.stopCh)
}