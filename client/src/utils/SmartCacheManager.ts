import pako from "pako";
import * as Y from "yjs";

interface CacheEntry {
  data: string;
  size: number;
}

/** Storage quota warning threshold (4MB - typical sessionStorage limit is 5-10MB) */
const QUOTA_WARNING_THRESHOLD = 4 * 1024 * 1024;

/** Track if we've shown the quota warning to avoid spam */
let quotaWarningShown = false;

/**
 * Show a warning notification about storage quota
 * Uses console.warn for now - can be integrated with toast system
 */
function notifyQuotaWarning(): void {
  if (quotaWarningShown) return;
  quotaWarningShown = true;

  console.warn(
    "⚠️ Storage quota nearly exceeded. Your document may not sync properly if storage is full. " +
    "Consider closing other browser tabs to free memory."
  );

  // Reset warning flag after 5 minutes to allow showing again
  setTimeout(() => {
    quotaWarningShown = false;
  }, 5 * 60 * 1000);
}

export class SmartCacheManager {
  private readonly prefix = "notex_room_";
  private readonly yjsPrefix = "notex_yjs_";

  /**
   * Save room data to sessionStorage with compression
   * Stores content string (JSON) instead of binary
   */
  save(roomSlug: string, content: string): void {
    try {
      // Check approximate storage size before saving
      const currentSize = this.getCurrentStorageSize();
      const newSize = content.length * 2; // Rough estimate (UTF-16)

      if (currentSize + newSize > QUOTA_WARNING_THRESHOLD) {
        notifyQuotaWarning();
      }

      // Compress string data using gzip
      const compressed = pako.deflate(content);
      // Convert Uint8Array to base64 string for storage
      const base64 = btoa(String.fromCharCode(...compressed));

      const entry: CacheEntry = {
        data: base64,
        size: base64.length,
      };

      sessionStorage.setItem(
        `${this.prefix}${roomSlug}`,
        JSON.stringify(entry),
      );
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        console.error("❌ SessionStorage quota exceeded! Cannot save room cache.");
        // Clear oldest caches to try to make room
        this.clearOldestCaches();
        throw new Error("Storage quota exceeded. Some data may not be saved.");
      } else {
        console.error("Failed to save to cache:", e);
      }
    }
  }

  /**
   * Load room data from sessionStorage with decompression
   * Returns content string (JSON)
   */
  load(roomSlug: string): string | null {
    try {
      const item = sessionStorage.getItem(`${this.prefix}${roomSlug}`);
      if (!item) return null;

      const entry: CacheEntry = JSON.parse(item);

      // Decode base64
      const binary = atob(entry.data);
      const compressed = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        compressed[i] = binary.charCodeAt(i);
      }

      // Decompress
      return pako.inflate(compressed, { to: "string" });
    } catch (e) {
      console.error(`Failed to load cache for room ${roomSlug}:`, e);
      // Remove corrupted cache entry
      this.remove(roomSlug);
      return null;
    }
  }

  /**
   * Remove a specific room from cache
   */
  remove(roomSlug: string): void {
    sessionStorage.removeItem(`${this.prefix}${roomSlug}`);
    sessionStorage.removeItem(`${this.yjsPrefix}${roomSlug}`);
    console.log(`🗑️ Removed room from cache: ${roomSlug}`);
  }

  // ========================================
  // Yjs State Methods (Binary format)
  // ========================================

  /**
   * Save Yjs document state to sessionStorage
   * Uses Y.encodeStateAsUpdate format
   */
  saveYjs(roomSlug: string, doc: Y.Doc): void {
    try {
      const update = Y.encodeStateAsUpdate(doc);
      const base64 = btoa(String.fromCharCode(...update));
      sessionStorage.setItem(`${this.yjsPrefix}${roomSlug}`, base64);
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        console.error("❌ SessionStorage quota exceeded! Cannot save Yjs state.");
        this.clearOldestCaches();
      } else {
        console.error("Failed to save Yjs cache:", e);
      }
    }
  }

  /**
   * Load Yjs document state from sessionStorage
   * Returns the update as Uint8Array, or null if not found
   */
  loadYjs(roomSlug: string): Uint8Array | null {
    try {
      const base64 = sessionStorage.getItem(`${this.yjsPrefix}${roomSlug}`);
      if (!base64) return null;

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (e) {
      console.error(`Failed to load Yjs cache for room ${roomSlug}:`, e);
      this.removeYjs(roomSlug);
      return null;
    }
  }

  /**
   * Remove Yjs cache for a room
   */
  removeYjs(roomSlug: string): void {
    sessionStorage.removeItem(`${this.yjsPrefix}${roomSlug}`);
  }

  /**
   * Clear all cached rooms
   */
  clearAll(): void {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(this.prefix) || key.startsWith(this.yjsPrefix)) {
        sessionStorage.removeItem(key);
      }
    });
    console.log("🗑️ Cleared all room caches");
  }

  /**
   * Get storage usage information
   */
  getStorageInfo() {
    const rooms = this.getAllRooms();
    const totalSize = rooms.reduce((sum, r) => sum + r.size, 0);

    return {
      roomCount: rooms.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      rooms: rooms.map((r) => ({
        slug: r.slug,
        sizeMB: (r.size / (1024 * 1024)).toFixed(2),
      })),
    };
  }

  /**
   * Get current storage size in bytes
   */
  private getCurrentStorageSize(): number {
    let size = 0;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const value = sessionStorage.getItem(key);
        if (value) {
          size += key.length * 2 + value.length * 2; // UTF-16 encoding
        }
      }
    }
    return size;
  }

  /**
   * Clear oldest cache entries to free space
   */
  private clearOldestCaches(): void {
    const rooms = this.getAllRooms();
    // Remove oldest 25% of caches
    const toRemove = Math.ceil(rooms.length * 0.25);
    console.warn(`🗑️ Clearing ${toRemove} oldest cache entries to free space`);

    for (let i = 0; i < toRemove && i < rooms.length; i++) {
      this.remove(rooms[i].slug);
    }
  }

  /**
   * Get all cached rooms with metadata
   */
  private getAllRooms(): Array<{ slug: string } & CacheEntry> {
    const rooms: Array<{ slug: string } & CacheEntry> = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        const slug = key.replace(this.prefix, "");
        const item = sessionStorage.getItem(key);
        if (item) {
          try {
            const entry: CacheEntry = JSON.parse(item);
            rooms.push({ slug, ...entry });
          } catch (e) {
            console.error(`Corrupted cache entry: ${key}`);
          }
        }
      }
    }

    return rooms;
  }
}

// Singleton instance
export const cacheManager = new SmartCacheManager();
