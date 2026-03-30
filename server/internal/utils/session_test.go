package utils

import (
	"os"
	"testing"
)

func TestGenerateAndValidateToken(t *testing.T) {
	os.Setenv("SESSION_SECRET", "test-secret-key-32-bytes-long!!")
	defer os.Unsetenv("SESSION_SECRET")

	userID := "user_abc123"
	token, err := GenerateToken(userID)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	if token == "" {
		t.Fatal("Token should not be empty")
	}

	session, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if session.UserID != userID {
		t.Errorf("Expected UserID %s, got %s", userID, session.UserID)
	}
}

func TestValidateToken_InvalidFormat(t *testing.T) {
	os.Setenv("SESSION_SECRET", "test-secret-key-32-bytes-long!!")
	defer os.Unsetenv("SESSION_SECRET")

	_, err := ValidateToken("invalid-token")
	if err != ErrInvalidToken {
		t.Errorf("Expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateToken_InvalidSignature(t *testing.T) {
	os.Setenv("SESSION_SECRET", "test-secret-key-32-bytes-long!!")
	defer os.Unsetenv("SESSION_SECRET")

	userID := "user_abc123"
	token, _ := GenerateToken(userID)

	// Tamper with the signature by using a different secret
	os.Setenv("SESSION_SECRET", "different-secret-key-32-bytes-long")
	defer os.Setenv("SESSION_SECRET", "test-secret-key-32-bytes-long!!")

	_, err := ValidateToken(token)
	if err != ErrInvalidSignature {
		t.Errorf("Expected ErrInvalidSignature, got %v", err)
	}
}

func TestValidateToken_MissingSecret(t *testing.T) {
	os.Unsetenv("SESSION_SECRET")

	// Set GIN_MODE to release to test production behavior
	// (in development mode, there's a fallback secret)
	originalMode := os.Getenv("GIN_MODE")
	os.Setenv("GIN_MODE", "release")
	defer os.Setenv("GIN_MODE", originalMode)

	_, err := ValidateToken("any.token")
	if err != ErrMissingSecret {
		t.Errorf("Expected ErrMissingSecret, got %v", err)
	}
}

func TestValidateToken_DevFallback(t *testing.T) {
	os.Unsetenv("SESSION_SECRET")
	defer os.Unsetenv("SESSION_SECRET")

	// In development mode (GIN_MODE != "release"), should use fallback secret
	originalMode := os.Getenv("GIN_MODE")
	os.Unsetenv("GIN_MODE")
	defer os.Setenv("GIN_MODE", originalMode)

	// Should not error - uses dev fallback
	_, err := ValidateToken("any.token")
	if err != ErrInvalidToken {
		t.Errorf("Expected ErrInvalidToken (due to fallback secret), got %v", err)
	}
}

func TestGenerateUserID(t *testing.T) {
	id1 := GenerateUserID()
	id2 := GenerateUserID()

	if id1 == id2 {
		t.Error("Generated IDs should be unique")
	}

	if len(id1) < 5 {
		t.Errorf("User ID too short: %s", id1)
	}
}