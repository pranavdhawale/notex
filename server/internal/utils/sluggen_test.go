package utils

import (
	"testing"
)

func TestGenerateSlug(t *testing.T) {
	// Test that slug generation works
	slug := GenerateSlug()
	
	if slug == "" {
		t.Error("Generated slug should not be empty")
	}
	
	// Test that slug contains a hyphen (2-word format)
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
	// Generate 100 slugs and check for variety
	slugs := make(map[string]bool)
	
	for i := 0; i < 100; i++ {
		slug := GenerateSlug()
		slugs[slug] = true
	}
	
	// We should have a good variety (at least 80% unique)
	if len(slugs) < 80 {
		t.Errorf("Expected at least 80 unique slugs out of 100, got %d", len(slugs))
	}
	
	t.Logf("Generated %d unique slugs out of 100", len(slugs))
	
	// Print first 10 for inspection
	count := 0
	for slug := range slugs {
		if count < 10 {
			t.Logf("Sample slug: %s", slug)
			count++
		}
	}
}
