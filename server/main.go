package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"
	"github.com/joho/godotenv"
	"github.com/pranavdhawale/notex/server/internal/api"
	"github.com/pranavdhawale/notex/server/internal/middleware"
	"github.com/pranavdhawale/notex/server/internal/state"
	"github.com/pranavdhawale/notex/server/internal/utils"
	"github.com/pranavdhawale/notex/server/internal/ws"
)

func main() {
	// Load .env file in development mode
	if os.Getenv("GIN_MODE") != "release" {
		// Try loading .env from current directory, then parent directory
		if err := godotenv.Load(); err != nil {
			if err := godotenv.Load("../.env"); err != nil {
				log.Println("No .env file found, using environment variables")
			}
		}
	}

	// Set Gin mode
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}
	state.InitMongo(mongoURI, "notex")

	//redisAddr := os.Getenv("REDIS_ADDR")
	//if redisAddr == "" {
	//	redisAddr = "localhost:6379"
	//}
	//redisPassword := os.Getenv("REDIS_PASSWORD")
	//state.InitRedis(redisAddr, redisPassword)

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
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "X-User-ID", "Authorization"},
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

	// Session endpoint - creates or refreshes session token (public)
	r.GET("/api/session", func(c *gin.Context) {
		// Check if user already has a valid token
		authHeader := c.GetHeader("Authorization")
		var userID string

		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				session, err := utils.ValidateToken(parts[1])
				if err == nil {
					// Token is valid, return it
					c.JSON(http.StatusOK, gin.H{
						"token":   parts[1],
						"userID":  session.UserID,
						"isNew":   false,
					})
					return
				}
			}
		}

		// Generate new user ID and token
		userID = utils.GenerateUserID()
		token, err := utils.GenerateToken(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate session"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token":   token,
			"userID":  userID,
			"isNew":   true,
		})
	})

	// API Routes
	apiGroup := r.Group("/api")

	// Public routes (no auth required)
	apiGroup.POST("/rooms", api.CreateRoom)
	apiGroup.GET("/rooms/:room", api.GetRoom)

	// Protected routes (require auth)
	protected := apiGroup.Group("")
	protected.Use(middleware.AuthRequired())
	{
		protected.DELETE("/rooms/:room", api.DeleteRoom)
		protected.POST("/rooms/:room/save", api.SaveRoom)
		protected.POST("/upload/:room", api.UploadFile)
		protected.GET("/rooms/:room/files", api.ListFiles)
		protected.GET("/rooms/:room/files/:fileId/download", api.DownloadFile)
		protected.DELETE("/rooms/:room/files", api.DeleteAllFiles)
		protected.DELETE("/rooms/:room/files/:fileId", api.DeleteFile)
	}

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

	srv := &http.Server{
		Addr:           ":" + port,
		Handler:        r,
		ReadTimeout:    10 * time.Minute, // Allow large file uploads
		WriteTimeout:   10 * time.Minute,
		MaxHeaderBytes: 1 << 20,
	}

	log.Printf("Server starting on port %s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to run server: %v", err)
	}
}