# Redis Usage Documentation

## Overview
**Current Version:** v1.0 (Development)
**Current Version:** v1.0 (Development)
**Status:** 🌑 **Disabled (Commented Out)**

The `notex` backend has the Redis connection logic **commented out**. 
Additionally, the `docker-compose.yml` file **does not contain a Redis service**, confirming it is fully removed/disabled.

---

## 1. Configuration & Initialization
The Redis connection is configured via environment variables and initialized in `server/main.go`.

**Environment Variables:**
- `REDIS_ADDR`: Address of the Redis server (default: `localhost:6379`)
- `REDIS_PASSWORD`: Password for authentication (default: empty)

**Code Reference:**
- `server/internal/state/redis.go`: Defines the `InitRedis` function and the global `RedisClient` variable.
- `server/main.go`: Calls `state.InitRedis` during server startup.

## 2. Intended vs. Current Architecture

### Intended Architecture (Future Goal)
As described in the project `README.md`, Redis is intended to handle:
- **Pub/Sub**: Synchronizing messages across multiple server instances.
- **Presence**: Storing "who is online" state persistently.
- **Ephemeral State**: Caching room data for quick access.

### Current Implementation (In-Memory)
Currently, `server/internal/ws/hub.go` uses Go's native `map` types to store state:
- **Room Membership**: `map[string]map[*Client]bool`
- **Awareness/Cursors**: `map[string]map[*Client][]byte`

**Implications:**
1.  **No Horizontal Scaling**: You cannot run multiple replicas of the `server` container. If you do, users connected to Replica A will not see users connected to Replica B.
2.  **State Loss on Restart**: If the server restarts, all "Presence" and "Awareness" data is lost immediately.

## 3. How to Enable Redis (Next Steps)
To fully utilize Redis as documented, the `Hub` struct in `server/internal/ws/hub.go` needs to be refactored:

1.  **Replace Maps with Redis**:
    -   Store awareness data using `RedisClient.HSet` and `RedisClient.HGet`.
2.  **Implement Pub/Sub**:
    -   Use `RedisClient.Subscribe` to listen for room updates.
    -   Use `RedisClient.Publish` to broadcast messages to all subscribers.
