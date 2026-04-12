/**
 * Application-wide constants
 */

/**
 * Colors used for collaborative cursor display
 * These are assigned to users to distinguish different participants
 */
export const CURSOR_COLORS = [
  "#958DF1", // Purple
  "#F98181", // Coral
  "#FBBC88", // Orange
  "#FAF594", // Yellow
  "#70CFF8", // Blue
  "#94FADB", // Teal
  "#B9F18D", // Green
] as const;

/**
 * Get a consistent color for a user based on their user ID
 * @param userId - The user's unique identifier
 * @returns A hex color string
 */
export function getUserColor(userId: string): string {
  // Generate a simple hash from the user ID
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Use the hash to pick a color from the array
  const index = Math.abs(hash) % CURSOR_COLORS.length;
  return CURSOR_COLORS[index];
}

/**
 * Room TTL constants
 */
export const ROOM_TTL = {
  /** Empty rooms expire after 24 hours */
  EMPTY_MS: 24 * 60 * 60 * 1000,
  /** Rooms with content expire after 7 days */
  WITH_CONTENT_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * File upload limits
 */
export const FILE_UPLOAD = {
  /** Maximum file size in bytes (200MB) */
  MAX_SIZE: 200 * 1024 * 1024,
  /** Maximum filename length */
  MAX_FILENAME_LENGTH: 50,
} as const;

/**
 * Image upload configuration for inline editor images
 */
export const IMAGE_UPLOAD = {
  /** Maximum image file size in bytes (10MB) */
  MAX_SIZE: 10 * 1024 * 1024,
  /** Allowed MIME types for inline image paste/drop */
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const,
} as const;

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  /** Yjs document save debounce in milliseconds */
  YJS_SAVE_DEBOUNCE_MS: 500,
  /** Storage quota warning threshold in bytes (4MB) */
  QUOTA_WARNING_THRESHOLD: 4 * 1024 * 1024,
} as const;