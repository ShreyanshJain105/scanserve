import { prisma } from "../prisma";
import { deleteImageObject } from "./objectStorage";
import { logger } from "../utils/logger";

const isCleanupEnabled = (process.env.ENABLE_DELETED_ASSET_CLEANUP || "true").toLowerCase() !== "false";
const cleanupIntervalMs = Number(process.env.DELETED_ASSET_CLEANUP_INTERVAL_MS || 10 * 60 * 1000);
const cleanupBatchSize = Number(process.env.DELETED_ASSET_CLEANUP_BATCH_SIZE || 20);
const cleanupMaxAttempts = Number(process.env.DELETED_ASSET_CLEANUP_MAX_ATTEMPTS || 8);
const baseBackoffMs = Number(process.env.DELETED_ASSET_CLEANUP_BASE_BACKOFF_MS || 60_000);

let cleanupTimer: NodeJS.Timeout | null = null;
let cleanupInFlight = false;

export const enqueueDeletedMenuItemImage = async ({
  entityId,
  s3Path,
}: {
  entityId: string;
  s3Path: string;
}) => {
  await enqueueDeletedAsset({
    assetType: "menu_item_image",
    entityId,
    s3Path,
  });
};

export const enqueueDeletedBusinessLogo = async ({
  entityId,
  s3Path,
}: {
  entityId: string;
  s3Path: string;
}) => {
  await enqueueDeletedAsset({
    assetType: "business_logo",
    entityId,
    s3Path,
  });
};

const enqueueDeletedAsset = async ({
  assetType,
  entityId,
  s3Path,
}: {
  assetType: "menu_item_image" | "business_logo";
  entityId: string;
  s3Path: string;
}) => {
  if (!s3Path.trim()) return;
  await prisma.deletedAssetCleanup.create({
    data: {
      assetType,
      entityId,
      s3Path,
      status: "pending",
      nextAttemptAt: new Date(),
    },
  });
};

const claimPendingJobs = async () => {
  const now = new Date();
  const candidates = await prisma.deletedAssetCleanup.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      attemptCount: { lt: cleanupMaxAttempts },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: cleanupBatchSize,
  });

  const claimed: Array<{ id: string; s3Path: string; attemptCount: number }> = [];

  for (const row of candidates) {
    const updated = await prisma.deletedAssetCleanup.updateMany({
      where: {
        id: row.id,
        status: { in: ["pending", "failed"] },
      },
      data: {
        status: "processing",
      },
    });
    if (updated.count === 1) {
      claimed.push({ id: row.id, s3Path: row.s3Path, attemptCount: row.attemptCount });
    }
  }

  return claimed;
};

const markCleanupSuccess = async (id: string) => {
  await prisma.deletedAssetCleanup.update({
    where: { id },
    data: {
      status: "done",
      processedAt: new Date(),
      lastError: null,
    },
  });
};

const markCleanupFailure = async ({
  id,
  attemptCount,
  errorMessage,
}: {
  id: string;
  attemptCount: number;
  errorMessage: string;
}) => {
  const nextAttemptCount = attemptCount + 1;
  const nextDelay = Math.min(baseBackoffMs * Math.pow(2, Math.max(0, nextAttemptCount - 1)), 24 * 60 * 60 * 1000);
  await prisma.deletedAssetCleanup.update({
    where: { id },
    data: {
      status: nextAttemptCount >= cleanupMaxAttempts ? "failed" : "failed",
      attemptCount: nextAttemptCount,
      lastError: errorMessage.slice(0, 300),
      nextAttemptAt: nextAttemptCount >= cleanupMaxAttempts ? null : new Date(Date.now() + nextDelay),
    },
  });
};

export const runDeletedAssetCleanupOnce = async () => {
  if (!isCleanupEnabled) return;
  if (cleanupInFlight) return;

  cleanupInFlight = true;
  try {
    const jobs = await claimPendingJobs();
    if (jobs.length === 0) return;

    logger.info("cleanup.deleted_assets.started", { count: jobs.length });

    let success = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await deleteImageObject(job.s3Path);
        await markCleanupSuccess(job.id);
        success += 1;
      } catch (error) {
        failed += 1;
        await markCleanupFailure({
          id: job.id,
          attemptCount: job.attemptCount,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("cleanup.deleted_assets.finished", {
      success,
      failed,
      total: jobs.length,
    });
  } finally {
    cleanupInFlight = false;
  }
};

export const startDeletedAssetCleanupWorker = () => {
  if (!isCleanupEnabled) {
    logger.info("cleanup.deleted_assets.disabled");
    return;
  }
  if (cleanupTimer) return;

  logger.info("cleanup.deleted_assets.worker_started", {
    intervalMs: cleanupIntervalMs,
    batchSize: cleanupBatchSize,
    maxAttempts: cleanupMaxAttempts,
  });

  cleanupTimer = setInterval(() => {
    void runDeletedAssetCleanupOnce().catch((error) => {
      logger.warn("cleanup.deleted_assets.tick_failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }, cleanupIntervalMs);

  void runDeletedAssetCleanupOnce().catch((error) => {
    logger.warn("cleanup.deleted_assets.bootstrap_failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });
};

export const stopDeletedAssetCleanupWorker = () => {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = null;
};
