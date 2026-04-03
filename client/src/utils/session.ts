const USER_ID_KEY = 'notex_user_id';

/**
 * Get or create a persistent user ID
 * This ID is stored in localStorage and never changes
 * No server validation needed - UUIDs are cryptographically random (128 bits of entropy)
 */
export function getUserID(): string {
  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) return stored;

  // Generate new user ID on first visit - use full UUID for 128 bits of entropy
  const newID = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, newID);
  return newID;
}

/**
 * Clear user ID (useful for testing or explicit logout)
 */
export function clearUserID(): void {
  localStorage.removeItem(USER_ID_KEY);
}

/**
 * Check if user ID exists
 */
export function hasUserID(): boolean {
  return localStorage.getItem(USER_ID_KEY) !== null;
}