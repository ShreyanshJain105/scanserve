import { prisma } from "../prisma";
import { logger } from "../utils/logger";
import { insertReviewsIntoWarehouse, mapReviewRowToWarehouse } from "./reviewWarehouse";
import { invalidateReviewCacheForBusiness } from "./reviewCache";

const isMigrationEnabled =
  (process.env.ENABLE_REVIEW_MIGRATION || "true").toLowerCase() !== "false";
const migrationIntervalMs = Number(process.env.REVIEW_MIGRATION_INTERVAL_MS || 6 * 60 * 60 * 1000);
const migrationBatchSize = Number(process.env.REVIEW_MIGRATION_BATCH_SIZE || 200);
const reviewHotDays = Math.max(1, Number(process.env.REVIEW_HOT_DAYS || 90));

let migrationTimer: NodeJS.Timeout | null = null;
let migrationInFlight = false;

const getCutoffDate = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - reviewHotDays);
  return cutoff;
};

export const runReviewMigrationOnce = async () => {
  if (!isMigrationEnabled) return;
  if (migrationInFlight) return;
  migrationInFlight = true;
  try {
    const cutoff = getCutoffDate();
    const reviews = await prisma.review.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: migrationBatchSize,
      include: { _count: { select: { likes: true } } },
    });

    if (reviews.length === 0) return;

    const rows = reviews.map((review) =>
      mapReviewRowToWarehouse({
        reviewId: review.id,
        orderId: review.orderId,
        businessId: review.businessId,
        customerUserId: review.customerUserId,
        rating: review.rating,
        comment: review.comment,
        likesCount: review._count.likes,
        createdAt: review.createdAt,
      })
    );

    await insertReviewsIntoWarehouse(rows);

    const reviewIds = reviews.map((review) => review.id);
    await prisma.review.deleteMany({ where: { id: { in: reviewIds } } });

    const businessIds = [...new Set(reviews.map((review) => review.businessId))];
    await Promise.all(businessIds.map((businessId) => invalidateReviewCacheForBusiness(businessId)));

    logger.info("reviews.migration.completed", {
      migrated: reviews.length,
      cutoff: cutoff.toISOString(),
    });
  } catch (error) {
    logger.warn("reviews.migration.failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } finally {
    migrationInFlight = false;
  }
};

export const startReviewMigrationWorker = () => {
  if (!isMigrationEnabled) {
    logger.info("reviews.migration.disabled");
    return;
  }
  if (migrationTimer) return;

  logger.info("reviews.migration.worker_started", {
    intervalMs: migrationIntervalMs,
    batchSize: migrationBatchSize,
    hotDays: reviewHotDays,
  });

  migrationTimer = setInterval(() => {
    void runReviewMigrationOnce();
  }, migrationIntervalMs);

  void runReviewMigrationOnce();
};

export const stopReviewMigrationWorker = () => {
  if (!migrationTimer) return;
  clearInterval(migrationTimer);
  migrationTimer = null;
};
