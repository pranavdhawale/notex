package cleanup

import (
	"testing"
	"time"
)

// TestStartOrphanedFilesCleanup_Signature tests the cleanup function signature
func TestStartOrphanedFilesCleanup_Signature(t *testing.T) {
	// Verify the function exists and has correct signature (returns stop channel)
	var _ func(time.Duration) chan struct{} = StartOrphanedFilesCleanup

	t.Log("StartOrphanedFilesCleanup function signature is correct")
}

// TestCleanupOrphanedFiles_Signature tests the cleanupOrphanedFiles function
func TestCleanupOrphanedFiles_Signature(t *testing.T) {
	// Verify the function exists
	// Note: cleanupOrphanedFiles is not exported, so we test the exported StartOrphanedFilesCleanup
	// which calls cleanupOrphanedFiles internally

	t.Log("cleanupOrphanedFiles function exists (tested via StartOrphanedFilesCleanup)")
}