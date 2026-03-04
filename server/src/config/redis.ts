import dotenv from 'dotenv';

dotenv.config();

// Redis is optional. When REDIS_URL is not set, we use an in-memory fallback.
let redis: import('ioredis').default | null = null;

export async function initRedis() {
  if (!process.env.REDIS_URL) {
    console.log('REDIS_URL not set - using in-memory cache fallback');
    return null;
  }

  try {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null; // stop retrying after 3 attempts
        return Math.min(times * 50, 2000);
      },
      lazyConnect: true,
    });

    client.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    client.on('connect', () => {
      console.log('Connected to Redis');
    });

    await client.connect();
    redis = client;
    return client;
  } catch (err) {
    console.warn('Redis unavailable, falling back to in-memory store:', (err as Error).message);
    return null;
  }
}

// Simple in-memory cache fallback when Redis is not available
const memoryCache = new Map<string, { value: string; expiresAt?: number }>();

export const cache = {
  async get(key: string): Promise<string | null> {
    if (redis) return redis.get(key);
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      memoryCache.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (redis) {
      if (ttlSeconds) await redis.set(key, value, 'EX', ttlSeconds);
      else await redis.set(key, value);
      return;
    }
    memoryCache.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  },

  async del(key: string): Promise<void> {
    if (redis) { await redis.del(key); return; }
    memoryCache.delete(key);
  },
};

export default redis;
