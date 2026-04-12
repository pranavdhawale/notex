const USER_ID_KEY = 'notex_user_id';
const USERNAME_KEY = 'notex_username';

// Cached values to avoid repeated localStorage reads
let cachedUserID: string | null = null;
let cachedUsername: string | null = null;

/**
 * Get or create a persistent user ID
 * This ID is stored in localStorage and never changes
 * No server validation needed - UUIDs are cryptographically random (128 bits of entropy)
 */
export function getUserID(): string {
	// Return cached value if available
	if (cachedUserID) return cachedUserID;

	const stored = localStorage.getItem(USER_ID_KEY);
	if (stored) {
		cachedUserID = stored;
		return stored;
	}

	// Generate new user ID on first visit - use full UUID for 128 bits of entropy
	const newID = crypto.randomUUID();
	localStorage.setItem(USER_ID_KEY, newID);
	cachedUserID = newID;
	return newID;
}

/**
 * Get or set username (cached for performance)
 */
export function getUsername(): string | null {
	if (cachedUsername !== null) return cachedUsername;
	cachedUsername = localStorage.getItem(USERNAME_KEY);
	return cachedUsername;
}

export function setUsername(username: string): void {
	localStorage.setItem(USERNAME_KEY, username);
	cachedUsername = username;
}

/**
 * Clear user ID (useful for testing or explicit logout)
 */
export function clearUserID(): void {
	localStorage.removeItem(USER_ID_KEY);
	cachedUserID = null;
}

/**
 * Check if user ID exists
 */
export function hasUserID(): boolean {
	return localStorage.getItem(USER_ID_KEY) !== null;
}