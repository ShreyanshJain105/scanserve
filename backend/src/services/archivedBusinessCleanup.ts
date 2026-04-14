import { prisma } from "../prisma";
import { extractImagePathFromUrl } from "./objectStorage";
import { logger } from "../utils/logger";
import type { Prisma } from "@prisma/client";

const isCleanupEnabled =
  (process.env.ENABLE_ARCHIVED_BUSINESS_CLEANUP || "true").toLowerCase() !== "false";
const cleanupIntervalMs = Number(
  process.env.ARCHIVED_BUSINESS_CLEANUP_INTERVAL_MS || 24 * 60 * 60 * 1000
);
const cleanupBatchSize = Number(process.env.ARCHIVED_BUSINESS_CLEANUP_BATCH_SIZE || 10);
const archiveRetentionDays = Number(process.env.BUSINESS_ARCHIVE_RETENTION_DAYS || 30);

let cleanupTimer: NodeJS.Timeout | null = null;
let cleanupInFlight = false;

const getArchiveCutoff = () => {
  const now = Date.now();
  const retentionMs = archiveRetentionDays * 24 * 60 * 60 * 1000;
  return new Date(now - retentionMs);
};

const enqueueCleanupRows = async ({
  tx,
  businessId,
  logoPath,
  menuPaths,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  logoPath: string | null;
  menuPaths: string[];
}) => {
  const rows = [
    ...menuPaths.map((path) => ({
      assetType: "menu_item_image" as const,
      entityId: businessId,
      s3Path: path,
      status: "pending" as const,
      nextAttemptAt: new Date(),
    })),
    ...(logoPath
      ? [
          {
            assetType: "business_logo" as const,
            entityId: businessId,
            s3Path: logoPath,
            status: "pending" as const,
            nextAttemptAt: new Date(),
          },
        ]
      : []),
  ];

  if (rows.length > 0) {
    await tx.deletedAssetCleanup.createMany({ data: rows });
  }

  return rows.length;
};

export const runArchivedBusinessCleanupOnce = async () => {
  if (!isCleanupEnabled) return;
  if (cleanupInFlight) return;

  cleanupInFlight = true;
  try {
    const cutoff = getArchiveCutoff();
    const businesses = await prisma.business.findMany({
      where: {
        status: "archived",
        archivedAt: { lte: cutoff },
      },
      orderBy: [{ archivedAt: "asc" }],
      take: cleanupBatchSize,
      select: {
        id: true,
        userId: true,
        name: true,
        slug: true,
        archivedAt: true,
        logoUrl: true,
      },
    });

    if (businesses.length === 0) return;

    logger.info("cleanup.archived_businesses.started", {
      count: businesses.length,
      retentionDays: archiveRetentionDays,
    });

    let deleted = 0;
    let failed = 0;
    for (const business of businesses) {
      try {
        const menuImages = await prisma.menuItem.findMany({
          where: { businessId: business.id, imagePath: { not: null } },
          select: { imagePath: true },
        });
        const menuPaths = menuImages
          .map((item: { imagePath: string | null }) => item.imagePath)
          .filter((path: string | null): path is string => Boolean(path));
        const logoPath = extractImagePathFromUrl(business.logoUrl);

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const queuedCount = await enqueueCleanupRows({
            tx,
            businessId: business.id,
            logoPath,
            menuPaths,
          });

          await tx.archivedBusinessDeletionAudit.create({
            data: {
              businessId: business.id,
              userId: business.userId,
              name: business.name,
              slug: business.slug,
              archivedAt: business.archivedAt ?? new Date(0),
              retentionDays: archiveRetentionDays,
              metadata: {
                queuedAssetCleanupCount: queuedCount,
                hadLogoPath: Boolean(logoPath),
                menuImageCount: menuPaths.length,
              },
            },
          });

          await tx.business.delete({
            where: { id: business.id },
          });
        });

        deleted += 1;
      } catch (error) {
        failed += 1;
        logger.warn("cleanup.archived_businesses.delete_failed", {
          businessId: business.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("cleanup.archived_businesses.finished", {
      deleted,
      failed,
      total: businesses.length,
    });
  } finally {
    cleanupInFlight = false;
  }
};

export const startArchivedBusinessCleanupWorker = () => {
  if (!isCleanupEnabled) {
    logger.info("cleanup.archived_businesses.disabled");
    return;
  }
  if (cleanupTimer) return;

  logger.info("cleanup.archived_businesses.worker_started", {
    intervalMs: cleanupIntervalMs,
    batchSize: cleanupBatchSize,
    retentionDays: archiveRetentionDays,
  });

  cleanupTimer = setInterval(() => {
    void runArchivedBusinessCleanupOnce().catch((error) => {
      logger.warn("cleanup.archived_businesses.tick_failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }, cleanupIntervalMs);

  void runArchivedBusinessCleanupOnce().catch((error) => {
    logger.warn("cleanup.archived_businesses.bootstrap_failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });
};

export const stopArchivedBusinessCleanupWorker = () => {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = null;
};
