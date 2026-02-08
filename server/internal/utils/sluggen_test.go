package utils

import (
	"testing"
)

// Existing tests...
func TestGenerateSlug(t *testing.T) {
	slug := GenerateSlug()
	
	if slug == "" {
		t.Error("Generated slug should not be empty")
	}
	
	hasHyphen := false
	for _, char := range slug {
		if char == '-' {
			hasHyphen = true
			break
		}
	}
	
	if !hasHyphen {
		t.Errorf("Generated slug '%s' should contain a hyphen for 2-word format", slug)
	}
	
	t.Logf("Generated slug: %s", slug)
}

func TestGenerateSlugUniqueness(t *testing.T) {
	slugs := make(map[string]bool)
	
	for i := 0; i < 100; i++ {
		slug := GenerateSlug()
		slugs[slug] = true
	}
	
	if len(slugs) < 80 {
		t.Errorf("Expected at least 80 unique slugs out of 100, got %d", len(slugs))
	}
	
	t.Logf("Generated %d unique slugs out of 100", len(slugs))
	
	count := 0
	for slug := range slugs {
		if count < 10 {
			t.Logf("Sample slug: %s", slug)
			count++
		}
	}
}

// New validation tests
func TestValidateCustomSlug(t *testing.T) {
	tests := []struct {
		name    string
		slug    string
		wantErr bool
	}{
		// Valid cases
		{"single word", "myroom", false},
		{"two words", "my-project", false},
		{"alphanumeric", "team123", false},
		{"two words alphanumeric", "abc-123", false},
		
		// Invalid cases
		{"empty", "", true},
		{"too long", "this-is-a-very-long-slug-that-exceeds-the-maximum-allowed-length", true},
		{"three words", "my-team-room", true},
		{"uppercase", "My-Room", true},
		{"underscore", "my_room", true},
		{"double hyphen", "my--room", true},
		{"leading hyphen", "-myroom", true},
		{"trailing hyphen", "myroom-", true},
		{"too short word", "a-b", true},
		{"special chars", "my@room", true},
		{"spaces", "my room", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateCustomSlug(tt.slug)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateCustomSlug(%q) error = %v, wantErr %v", tt.slug, err, tt.wantErr)
			}
			if err != nil {
				t.Logf("Validation error for %q: %v", tt.slug, err)
			}
		})
	}
}
