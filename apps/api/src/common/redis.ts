import IORedis from "ioredis";

/**
 * Tiny shared factory for an IORedis client. `maxRetriesPerRequest: null` mirrors the BullMQ
 * connections so a Redis blip degrades gracefully rather than throwing per-command. Callers own
 * the returned client's lifecycle (quit() on shutdown).
 */
export function createRedisClient(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}
