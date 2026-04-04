package utils

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (OWASP recommended)
const (
	argon2Memory      = 64 * 1024 // 64MB
	argon2Time        = 3
	argon2Parallelism = 4
	argon2KeyLength   = 32
	argon2SaltLength  = 16
)

// HashPassword creates an Argon2id hash of the password
func HashPassword(password string) (string, error) {
	// Generate random salt
	salt := make([]byte, argon2SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	// Generate hash
	hash := argon2.IDKey(
		[]byte(password),
		salt,
		argon2Time,
		argon2Memory,
		argon2Parallelism,
		argon2KeyLength,
	)

	// Encode as: $argon2id$v=19$m=65536,t=3,p=4$<base64(salt)>$<base64(hash)>
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encodedHash := fmt.Sprintf(
		"$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argon2Memory,
		argon2Time,
		argon2Parallelism,
		b64Salt,
		b64Hash,
	)

	return encodedHash, nil
}

// VerifyPassword checks if the password matches the hash
func VerifyPassword(password, encodedHash string) (bool, error) {
	// Parse the encoded hash
	salt, hash, params, err := decodeArgon2Hash(encodedHash)
	if err != nil {
		return false, err
	}

	// Compute hash with same parameters
	computedHash := argon2.IDKey(
		[]byte(password),
		salt,
		params.time,
		params.memory,
		params.parallelism,
		params.keyLength,
	)

	// Compare in constant time
	if subtle.ConstantTimeCompare(hash, computedHash) != 1 {
		return false, nil
	}

	return true, nil
}

type argon2Params struct {
	memory      uint32
	time        uint32
	parallelism uint8
	keyLength   uint32
}

func decodeArgon2Hash(encodedHash string) ([]byte, []byte, *argon2Params, error) {
	// Expected format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return nil, nil, nil, fmt.Errorf("invalid hash format")
	}

	if parts[1] != "argon2id" {
		return nil, nil, nil, fmt.Errorf("unsupported algorithm: %s", parts[1])
	}

	if parts[2] != "v=19" {
		return nil, nil, nil, fmt.Errorf("unsupported version: %s", parts[2])
	}

	// Parse parameters: m=65536,t=3,p=4
	params := &argon2Params{}
	_, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &params.memory, &params.time, &params.parallelism)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("invalid parameters: %v", err)
	}
	params.keyLength = argon2KeyLength

	// Decode salt
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return nil, nil, nil, fmt.Errorf("invalid salt: %v", err)
	}

	// Decode hash
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return nil, nil, nil, fmt.Errorf("invalid hash: %v", err)
	}

	return salt, hash, params, nil
}