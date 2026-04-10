import { getRedisClient } from "./redisClient";
import { logger } from "../utils/logger";

const cacheEnabled =
  (process.env.REVIEW_CACHE_ENABLED || "true").toLowerCase() !== "false" &&
  process.env.NODE_ENV !== "test";
const cachePrefix = process.env.REVIEW_CACHE_PREFIX || "reviews";
const versionPrefix = `${cachePrefix}:version`;

export const buildReviewCacheKey = (parts: string[]) => [cachePrefix, ...parts].join(":");

const buildReviewVersionKey = (businessId: string) =>
  [versionPrefix, businessId].join(":");

export const getReviewCacheVersion = async (businessId: string): Promise<number> => {
  if (!cacheEnabled) return 1;
  try {
    const client = await getRedisClient();
    const key = buildReviewVersionKey(businessId);
    const value = await client.get(key);
    const parsed = value ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed > 1) {
      return parsed;
    }
    const seed = Date.now();
    await client.set(key, String(seed));
    return seed;
  } catch (error) {
    logger.warn("reviews.cache.version_get_failed", {
      businessId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return 1;
  }
};

export const bumpReviewCacheVersion = async (businessId: string) => {
  if (!cacheEnabled) return;
  try {
    const client = await getRedisClient();
    const key = buildReviewVersionKey(businessId);
    const value = await client.get(key);
    const parsed = value ? Number(value) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 1) {
      await client.set(key, String(Date.now()));
      return;
    }
    await client.incr(key);
  } catch (error) {
    logger.warn("reviews.cache.version_bump_failed", {
      businessId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getReviewCache = async <T>(key: string): Promise<T | null> => {
  if (!cacheEnabled) return null;
  try {
    const client = await getRedisClient();
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    logger.warn("reviews.cache.get_failed", {
      key,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const setReviewCache = async (key: string, value: unknown) => {
  if (!cacheEnabled) return;
  try {
    const client = await getRedisClient();
    await client.set(key, JSON.stringify(value));
  } catch (error) {
    logger.warn("reviews.cache.set_failed", {
      key,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

export const invalidateReviewCacheForBusiness = async (businessId: string) => {
  if (!cacheEnabled) return;
  await bumpReviewCacheVersion(businessId);
  try {
    const client = await getRedisClient();
    let cursor = 0;
    const match = `${cachePrefix}:${businessId}:*`;
    do {
      const [nextCursor, keys] = await client.scan(cursor, {
        MATCH: match,
        COUNT: 100,
      });
      if (keys.length > 0) {
        await client.del(keys);
      }
      cursor = Number(nextCursor);
    } while (cursor !== 0);
  } catch (error) {
    logger.warn("reviews.cache.invalidate_failed", {
      businessId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};
