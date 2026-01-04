package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"
	"github.com/pranavdhawale/notex/server/internal/api"
	"github.com/pranavdhawale/notex/server/internal/state"
	"github.com/pranavdhawale/notex/server/internal/ws"
)

func main() {
	// Set Gin mode
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}
	state.InitMongo(mongoURI, "notex")

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	state.InitRedis(redisAddr)

	r := gin.Default()
	
	// CORS Configuration
	clientOrigin := os.Getenv("CLIENT_ORIGIN")
	if clientOrigin == "" {
		clientOrigin = "http://localhost:5173"
	}

	// CORS Configuration
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{clientOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "X-User-ID"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Health Check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
			"service": "notex-backend",
		})
	})

	// API Routes
	apiGroup := r.Group("/api")
	{
		apiGroup.POST("/rooms", api.CreateRoom)
		apiGroup.GET("/rooms/:room", api.GetRoom)
		apiGroup.DELETE("/rooms/:room", api.DeleteRoom)
		apiGroup.POST("/rooms/:room/save", api.SaveRoom)
		
		// File Sharing
		apiGroup.POST("/upload/:room", api.UploadFile)
		apiGroup.GET("/rooms/:room/files", api.ListFiles)
		apiGroup.DELETE("/rooms/:room/files/:fileId", api.DeleteFile)
	}

	// Static Uploads
	r.Static("/uploads", "./uploads")

	// Start WebSocket Hub
	go ws.MainHub.Run()

	// WebSocket Route
	r.GET("/ws/:room", func(c *gin.Context) {
		ws.ServeWs(ws.MainHub, c)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
