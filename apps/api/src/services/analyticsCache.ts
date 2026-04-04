import { getRedisClient } from "./redisClient";
import { logger } from "../utils/logger";

const cachePrefix = process.env.ANALYTICS_CACHE_PREFIX || "analytics";
const cacheTtlSec = Math.max(60, Number(process.env.ANALYTICS_CACHE_TTL_SEC || 900));

export const buildAnalyticsCacheKey = (parts: string[]) =>
  [cachePrefix, ...parts].join(":");

export const getAnalyticsCache = async <T>(key: string): Promise<T | null> => {
  try {
    const client = await getRedisClient();
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    logger.warn("analytics.cache.get_failed", {
      key,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const setAnalyticsCache = async (key: string, value: unknown) => {
  try {
    const client = await getRedisClient();
    await client.set(key, JSON.stringify(value), { EX: cacheTtlSec });
  } catch (error) {
    logger.warn("analytics.cache.set_failed", {
      key,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};
