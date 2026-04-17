package cleanup

import (
	"testing"
)

// TestStartOrphanedFilesCleanup_Signature tests the cleanup function signature
func TestStartOrphanedFilesCleanup_Signature(t *testing.T) {
	// Verify the function exists and has correct signature (no args, returns stop channel)
	var _ func() chan struct{} = StartOrphanedFilesCleanup

	t.Log("StartOrphanedFilesCleanup function signature is correct")
}

// TestISTLocation tests that the IST timezone loads correctly
func TestISTLocation(t *testing.T) {
	if istLocation.String() != "Asia/Kolkata" {
		t.Errorf("expected IST location to be Asia/Kolkata, got %s", istLocation.String())
	}
	t.Log("IST timezone loaded correctly")
}