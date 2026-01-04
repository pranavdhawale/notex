package ws

import (
	"log"
	"sync"
)

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
		broadcast:  make(chan *Message),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) CloseRoom(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.rooms[roomID]; ok {
		for client := range clients {
			close(client.send)
			delete(h.rooms[roomID], client)
		}
		delete(h.rooms, roomID)
		delete(h.awareness, roomID)
		log.Printf("Room closed: %s", roomID)
	}
}

func (h *Hub) Run() {
	for {
// ... (rest of Run loop remains the same, I will use replace_file_content carefully or just append the method if I can't match Run properly easily - actually I can match end of file or insert before Run)
// Better: Insert CloseRoom before Run.
		select {
		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.rooms[client.roomID]; !ok {
				h.rooms[client.roomID] = make(map[*Client]bool)
				h.awareness[client.roomID] = make(map[*Client][]byte)
			}
			h.rooms[client.roomID][client] = true
			log.Printf("Client registered to room: %s", client.roomID)

			// Send existing awareness states to the new client
			if states, ok := h.awareness[client.roomID]; ok {
				log.Printf("DEBUG: Sending %d cached awareness updates to new client in room %s", len(states), client.roomID)
				for _, state := range states {
					select {
					case client.send <- state:
					default:
						log.Printf("WARN: Failed to send cached awareness to client (buffer full)")
					}
				}
			} else {
				log.Printf("DEBUG: No cached awareness for room %s", client.roomID)
			}
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.rooms[client.roomID]; ok {
				if _, ok := h.rooms[client.roomID][client]; ok {
					delete(h.rooms[client.roomID], client)
					
					// Remove from awareness cache too
					if _, ok := h.awareness[client.roomID]; ok {
						delete(h.awareness[client.roomID], client)
					}
					
					close(client.send)
					log.Printf("Client unregistered from room: %s", client.roomID)
					// Cleanup room if empty
					if len(h.rooms[client.roomID]) == 0 {
						delete(h.rooms, client.roomID)
						delete(h.awareness, client.roomID)
					}
				}
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.Lock() // Use Write Lock for map updates
			
			// Detect Awareness Message (Type 1)
			if len(message.Content) > 0 && message.Content[0] == 1 {
				if _, ok := h.awareness[message.RoomID]; !ok {
					h.awareness[message.RoomID] = make(map[*Client][]byte)
				}
				
				// Make a copy of the slice to ensure persistence
				contentCopy := make([]byte, len(message.Content))
				copy(contentCopy, message.Content)
				
				h.awareness[message.RoomID][message.Sender] = contentCopy
				// log.Printf("DEBUG: Cached awareness update for client in room %s", message.RoomID)
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
						// If send buffer is full, close channel and assume client is dead
					}
				}
			}
		}
	}
}
