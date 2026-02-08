import pako from "pako";

interface CacheEntry {
  data: string;
  size: number;
}

export class SmartCacheManager {
  private readonly prefix = "notex_room_";

  /**
   * Save room data to sessionStorage with compression
   * Stores content string (JSON) instead of binary
   */
  save(roomSlug: string, content: string): void {
    try {
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
      if (e.name === "QuotaExceededError") {
        console.warn("SessionStorage quota exceeded! Cannot save room cache.");
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
    console.log(`🗑️ Removed room from cache: ${roomSlug}`);
  }

  /**
   * Clear all cached rooms
   */
  clearAll(): void {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(this.prefix)) {
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
