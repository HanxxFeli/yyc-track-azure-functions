/**
 * shared/cache.ts
 *
 * Redis-backed cache for Azure Functions using ioredis.
 *
 * Works identically in all three environments — no code changes needed:
 *
 *   Local dev      →  Redis in Docker (docker-compose up)
 *                     REDIS_CONNECTION_STRING=redis://localhost:6379
 *
 *   Azure staging  →  Azure Cache for Redis (Basic C0, ~$17 CAD/month)
 *   Azure prod     →  Azure Cache for Redis (Standard C1 or higher)
 *                     REDIS_CONNECTION_STRING=rediss://:password@host:6380
 *                     (note: Azure uses TLS port 6380 and "rediss://" scheme)
 *
 * If REDIS_CONNECTION_STRING is not set, the module falls back to an
 * in-process Map so the functions still work during initial setup.
 */

import Redis from "ioredis";

// ─── Client singleton ─────────────────────────────────────────────────────────
// ioredis manages its own connection pool. We create one client per
// Function App instance (not per request) and reuse it across invocations.

let redisClient: Redis | null = null;

function getClient(): Redis | null {
    const connStr = process.env.REDIS_CONNECTION_STRING;
    if (!connStr) return null;

    if (!redisClient) {
        redisClient = new Redis(connStr, {
        // Silently retry on transient connection drops (e.g. Azure maintenance)
        retryStrategy: (times) => {
            if (times > 5) return null; // stop retrying after 5 attempts
            return Math.min(times * 200, 2000); // back-off: 200ms, 400ms … 2s
        },
        // Do not crash the process on connection errors — fall back gracefully
        lazyConnect: false,
        enableOfflineQueue: false, // reject commands immediately if disconnected
                                    // so we fall back to in-process cache
        });

        redisClient.on("error", (err) => {
        // Log but don't throw — the fallback handles the request
        console.error("[cache] Redis error:", err.message);
        });
    }

    return redisClient;
}

// ─── Fallback in-process cache ────────────────────────────────────────────────
// Used when Redis is unavailable or REDIS_CONNECTION_STRING is not set.

interface MemEntry<T> { 
    data: T; 
    expiresAt: number 
}
const memStore = new Map<string, MemEntry<unknown>>();

function memGet<T>(key: string): T | null {
    const entry = memStore.get(key) as MemEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) { 
        memStore.delete(key); 
        return null; 
    }
    return entry.data;
}

function memSet<T>(key: string, data: T, ttlSeconds: number): void {
  memStore.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieves a cached value by key.
 * Returns null on cache miss, Redis error, or expired TTL.
 */
export async function getCache<T>(key: string): Promise<T | null> {
    const client = getClient();

    if (client && client.status === "ready") {
        try {
            const raw = await client.get(key);
            if (!raw) return null;

            return JSON.parse(raw) as T;
        } catch (err) {
            console.error("[cache] getCache Redis error, falling back to memory:", err);
            return memGet<T>(key);
        }
    }

    return memGet<T>(key);
}

/**
 * Stores a value in the cache with a TTL in seconds.
 * Serialises to JSON automatically.
 */
export async function setCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    const client = getClient();

    if (client && client.status === "ready") {
        try {
            // SETEX: set + expire atomically
            await client.setex(key, ttlSeconds, JSON.stringify(data));
            return;
        } catch (err) {
            console.error("[cache] setCache Redis error, falling back to memory:", err);
        }
    }

    memSet(key, data, ttlSeconds);
}

/**
 * Deletes one or more keys. Useful for forced cache invalidation.
 */
export async function deleteCache(...keys: string[]): Promise<void> {
    const client = getClient();

    if (client && client.status === "ready") {
        try {
        await client.del(...keys);
        return;
        } catch (err) {
        console.error("[cache] deleteCache Redis error:", err);
        }
    }

    keys.forEach((k) => memStore.delete(k));
}

/**
 * Clears all yyc-track cache keys (keys prefixed with "yyc:").
 * Safe to call without affecting other tenants on a shared Redis instance.
 */
export async function clearCache(): Promise<void> {
    const client = getClient();

    if (client && client.status === "ready") {
        try {
            // SCAN is non-blocking — safer than KEYS in production
            let cursor = "0";
            do {
                const [nextCursor, keys] = await client.scan(cursor, "MATCH", "yyc:*", "COUNT", 100);
                cursor = nextCursor;
                if (keys.length) await client.del(...keys);
            } while (cursor !== "0");
            return;
        } catch (err) {
            console.error("[cache] clearCache Redis error:", err);
        }
    }

    memStore.clear();
}

/**
 * Gracefully closes the Redis connection.
 * Call this in test teardown to prevent open handles.
 */
export async function closeCache(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}