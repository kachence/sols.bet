// @ts-ignore - upstash/redis does not ship its own TS types in some builds
import { Redis } from '@upstash/redis'

const { REDIS_URL, REDIS_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

// Prefer explicit vars, fall back to Upstash defaults
const redisUrl = REDIS_URL || UPSTASH_REDIS_REST_URL;
const redisToken = REDIS_TOKEN || UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error('REDIS_URL & REDIS_TOKEN (or Upstash equivalents) env variables are required');
}

// Ensure the Redis client is created only once per process (global scope).
const globalRedisKey = '__GLOBAL_REDIS_CLIENT__';

const redisClient =
  // Re-use existing instance when the module is re-evaluated (e.g. Next.js dev or hot lambda reload)
  (global as any)[globalRedisKey] ||
  new Redis({
    url: redisUrl,
    token: redisToken,
  });

// Cache the client on the global object for subsequent imports
if (!(global as any)[globalRedisKey]) {
  (global as any)[globalRedisKey] = redisClient;
}

export const redis = redisClient; 