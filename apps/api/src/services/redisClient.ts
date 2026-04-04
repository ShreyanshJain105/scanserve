import { createClient, RedisClientType } from "redis";
import { logger } from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient: RedisClientType | null = null;
let redisConnecting: Promise<RedisClientType> | null = null;

export const getRedisClient = async () => {
  if (redisClient?.isOpen) return redisClient;
  if (redisConnecting) return redisConnecting;

  redisClient = createClient({ url: redisUrl });
  redisClient.on("error", (error) => {
    logger.warn("redis.client.error", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });

  redisConnecting = redisClient
    .connect()
    .then(() => {
      logger.info("redis.client.connected", { url: redisUrl });
      return redisClient as RedisClientType;
    })
    .finally(() => {
      redisConnecting = null;
    });

  return redisConnecting;
};
