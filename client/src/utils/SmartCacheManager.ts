import pako from "pako";

interface CacheEntry {
  data: string;
  timestamp: number;
  size: number;
}

interface AccessLog {
  [roomSlug: string]: number;
}

export class SmartCacheManager {
  private maxRooms = 20;
  private maxSize = 5 * 1024 * 1024; // 5MB
  private readonly prefix = "notex_room_";
  private readonly accessLogKey = "notex_access_log";

  /**
   * Save room data to localStorage with compression
   */
  save(roomSlug: string, data: Uint8Array): void {
    try {
      // Compress data using gzip
      const compressed = pako.deflate(data);
      const base64 = btoa(String.fromCharCode(...compressed));

      const entry: CacheEntry = {
        data: base64,
        timestamp: Date.now(),
        size: base64.length,
      };

      localStorage.setItem(`${this.prefix}${roomSlug}`, JSON.stringify(entry));
      this.updateAccessLog(roomSlug);
    } catch (e: any) {
      if (e.name === "QuotaExceededError") {
        console.warn("LocalStorage quota exceeded, evicting oldest room...");
        this.evictOldest();
        this.save(roomSlug, data); // Retry after eviction
      } else {
        console.error("Failed to save to cache:", e);
      }
    }
  }

  /**
   * Load room data from localStorage with decompression
   */
  load(roomSlug: string): Uint8Array | null {
    try {
      const item = localStorage.getItem(`${this.prefix}${roomSlug}`);
      if (!item) return null;

      const entry: CacheEntry = JSON.parse(item);

      // Decode base64
      const binary = atob(entry.data);
      const compressed = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        compressed[i] = binary.charCodeAt(i);
      }

      // Decompress
      const decompressed = pako.inflate(compressed);

      // Update access log
      this.updateAccessLog(roomSlug);

      return decompressed;
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
    localStorage.removeItem(`${this.prefix}${roomSlug}`);

    // Also remove from access log
    const log = this.getAccessLog();
    delete log[roomSlug];
    localStorage.setItem(this.accessLogKey, JSON.stringify(log));

    console.log(`🗑️ Removed room from cache: ${roomSlug}`);
  }

  /**
   * Clear all cached rooms
   */
  clearAll(): void {
    const rooms = this.getAllRooms();
    rooms.forEach((room) => {
      localStorage.removeItem(`${this.prefix}${room.slug}`);
    });
    localStorage.removeItem(this.accessLogKey);
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
      percentUsed: ((totalSize / this.maxSize) * 100).toFixed(1),
      rooms: rooms.map((r) => ({
        slug: r.slug,
        sizeMB: (r.size / (1024 * 1024)).toFixed(2),
        lastAccessed: new Date(r.timestamp),
      })),
    };
  }

  /**
   * Evict the oldest (least recently used) room
   */
  private evictOldest(): void {
    const rooms = this.getAllRooms();
    if (rooms.length === 0) return;

    // Sort by timestamp (oldest first)
    rooms.sort((a, b) => a.timestamp - b.timestamp);
    const oldest = rooms[0];

    this.remove(oldest.slug);
    console.log(`🗑️ Evicted oldest room: ${oldest.slug}`);
  }

  /**
   * Get all cached rooms with metadata
   */
  private getAllRooms(): Array<{ slug: string } & CacheEntry> {
    const rooms: Array<{ slug: string } & CacheEntry> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        const slug = key.replace(this.prefix, "");
        const item = localStorage.getItem(key);
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

  /**
   * Update access log for LRU tracking
   */
  private updateAccessLog(roomSlug: string): void {
    const log = this.getAccessLog();
    log[roomSlug] = Date.now();
    localStorage.setItem(this.accessLogKey, JSON.stringify(log));
  }

  /**
   * Get access log
   */
  private getAccessLog(): AccessLog {
    const log = localStorage.getItem(this.accessLogKey);
    return log ? JSON.parse(log) : {};
  }
}

// Singleton instance
export const cacheManager = new SmartCacheManager();
