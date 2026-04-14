import { createClient, RedisClientType } from "redis";
import { logger } from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redisConnectTimeoutMs = Math.max(
  500,
  Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000)
);

let redisClient: RedisClientType | null = null;
let redisConnecting: Promise<RedisClientType> | null = null;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Redis connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const getRedisClient = async () => {
  if (redisClient?.isOpen) return redisClient;
  if (redisConnecting) return redisConnecting;

  redisClient = createClient({
    url: redisUrl,
    socket: { connectTimeout: redisConnectTimeoutMs },
  });
  redisClient.on("error", (error) => {
    logger.warn("redis.client.error", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });

  redisConnecting = withTimeout(redisClient.connect(), redisConnectTimeoutMs + 250)
    .then(() => {
      logger.info("redis.client.connected", { url: redisUrl });
      return redisClient as RedisClientType;
    })
    .catch((error) => {
      logger.warn("redis.client.connect_failed", {
        url: redisUrl,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      redisClient = null;
      throw error;
    })
    .finally(() => {
      redisConnecting = null;
    });

  return redisConnecting;
};
