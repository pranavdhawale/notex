package state

import "time"

// UnusedImageGracePeriod is the time an image must have ref_count=0 before
// it becomes eligible for cleanup. Shared between the API handler and
// background job to ensure consistent behavior.
const UnusedImageGracePeriod = 5 * time.Minute