import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import authRoutes from "./routes/auth";
import businessRoutes from "./routes/business";
import adminRoutes from "./routes/admin";
import publicRoutes from "./routes/public";
import aiRoutes from "./routes/ai";
import analyticsRoutes from "./routes/analytics";
import { requireCsrf } from "./middleware/csrf";
import { logger } from "./utils/logger";
import { startDeletedAssetCleanupWorker } from "./services/deletedAssetCleanup";
import { startArchivedBusinessCleanupWorker } from "./services/archivedBusinessCleanup";
import { startOrderEventOutboxWorker } from "./services/orderEventOutbox";
import { startOrderEventQueueConsumer } from "./services/orderEventQueueConsumer";
import { startOrderPartitionMaintenance } from "./services/orderPartitionMaintenance";
import { startReviewMigrationWorker } from "./services/reviewMigration";
import { requireInternalApiKey } from "./middleware/internalApiKey";
import { metricsMiddleware, metricsRegistry } from "./metrics";

const app: express.Express = express();
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// ─── Global Middleware ──────────────────────────────────────
// helmet: sets security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// cors: allows requests from the Next.js frontend only
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(metricsMiddleware);
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestIdHeader = req.header("x-request-id");
  const requestId = requestIdHeader && requestIdHeader.trim() ? requestIdHeader : randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]?.trim()
      : undefined;
  const clientIp = forwardedIp || req.ip || req.socket.remoteAddress || null;

  logger.info("http.request.start", {
    requestId,
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    clientIp,
    userAgent: req.get("user-agent") || null,
    contentType: req.get("content-type") || null,
  });

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info("http.request.finish", {
      requestId,
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      responseBytes: res.getHeader("content-length") || null,
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
    });
  });

  res.on("close", () => {
    if (res.writableEnded) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.warn("http.request.aborted", {
      requestId,
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
    });
  });
  next();
});

// Parse JSON bodies for all routes.
app.use(express.json());
app.use(requireCsrf);
app.use(requireInternalApiKey);

// ─── Health Check ───────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: 1, data: { ok: true, timestamp: new Date().toISOString() } });
});
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// ─── Routes (to be added per feature) ───────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/business/analytics", analyticsRoutes);
// app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/ai", aiRoutes);

// ─── Error Handler ──────────────────────────────────────────
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error("http.request.error", {
      requestId: req.requestId || null,
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
      errorMessage: err.message,
      errorStack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    });
    res.status(500).json({
      status: 0,
      error: {
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
      },
    });
  }
);

// ─── Start ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  startDeletedAssetCleanupWorker();
  startArchivedBusinessCleanupWorker();
  startOrderEventOutboxWorker();
  startOrderEventQueueConsumer();
  startOrderPartitionMaintenance();
  startReviewMigrationWorker();
  app.listen(PORT, () => {
    logger.info("api.server.started", {
      port: Number(PORT),
      env: process.env.NODE_ENV || "development",
      clientUrl: CLIENT_URL,
      pid: process.pid,
    });
  });
}

export default app;
