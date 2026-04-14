import { logger } from "./utils/logger";

import { PrismaClient } from "@prisma/client";

const prismaQueryLoggingEnabled = process.env.PRISMA_LOG_QUERIES === "true";
const prismaLogs = prismaQueryLoggingEnabled
  ? [{ emit: "event", level: "query" }, { emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }] as const
  : [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }] as const;

// Single Prisma instance for the API process.
export const prisma = new PrismaClient({ log: prismaLogs as any });

if (prismaQueryLoggingEnabled) {
  prisma.$on("query", (event: { query: string; params: string; duration: number }) => {
    logger.info("db.query", {
      durationMs: event.duration,
      query: event.query,
      params: event.params,
    });
  });
}
