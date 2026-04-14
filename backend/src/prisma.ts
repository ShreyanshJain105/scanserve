import { logger } from "./utils/logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require("@prisma/client") as { PrismaClient: new (options?: unknown) => unknown };

const prismaQueryLoggingEnabled = process.env.PRISMA_LOG_QUERIES === "true";
const prismaLogs = prismaQueryLoggingEnabled
  ? [{ emit: "event", level: "query" }, { emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
  : [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }];

// Single Prisma instance for the API process.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma = new PrismaClient({ log: prismaLogs }) as any;

if (prismaQueryLoggingEnabled) {
  prisma.$on("query", (event: { query: string; params: string; duration: number }) => {
    logger.info("db.query", {
      durationMs: event.duration,
      query: event.query,
      params: event.params,
    });
  });
}
