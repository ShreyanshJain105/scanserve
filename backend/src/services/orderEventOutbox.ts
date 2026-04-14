import { prisma } from "../prisma";
import { logger } from "../utils/logger";
import {
  getOrderEventStreamName,
  getOrderEventStreamMaxLen,
  publishOrderEventsToQueue,
} from "./orderEventQueue";

const isOutboxEnabled =
  (process.env.ENABLE_ORDER_EVENT_OUTBOX || "true").toLowerCase() !== "false";
const outboxIntervalMs = Number(process.env.ORDER_EVENT_OUTBOX_INTERVAL_MS || 30_000);
const outboxBatchSize = Number(process.env.ORDER_EVENT_OUTBOX_BATCH_SIZE || 100);
const outboxMaxAttempts = Number(process.env.ORDER_EVENT_OUTBOX_MAX_ATTEMPTS || 10);
const outboxBaseBackoffMs = Number(process.env.ORDER_EVENT_OUTBOX_BASE_BACKOFF_MS || 60_000);

let outboxTimer: NodeJS.Timeout | null = null;
let outboxInFlight = false;
const orderEventStream = getOrderEventStreamName();
const orderEventStreamMaxLen = getOrderEventStreamMaxLen();

export const enqueueOrderEventOutbox = async (params: {
  eventId: string;
  eventType: string;
  orderId: string;
  businessId: string;
  payload: unknown;
  eventCreatedAt: Date;
}) => {
  await prisma.orderEventOutbox.create({
    data: {
      eventId: params.eventId,
      eventType: params.eventType,
      orderId: params.orderId,
      businessId: params.businessId,
      payload: params.payload,
      eventCreatedAt: params.eventCreatedAt,
      status: "pending",
      nextAttemptAt: new Date(),
    },
  });
};

const claimPendingEvents = async () => {
  const now = new Date();
  const candidates = await prisma.orderEventOutbox.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      attemptCount: { lt: outboxMaxAttempts },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: outboxBatchSize,
  });

  const claimed: Array<{
    id: string;
    eventId: string;
    eventType: string;
    orderId: string;
    businessId: string;
    payload: unknown;
    eventCreatedAt: Date;
    attemptCount: number;
  }> = [];

  for (const row of candidates) {
    const updated = await prisma.orderEventOutbox.updateMany({
      where: { id: row.id, status: { in: ["pending", "failed"] } },
      data: { status: "processing" },
    });
    if (updated.count === 1) {
      claimed.push({
        id: row.id,
        eventId: row.eventId,
        eventType: row.eventType,
        orderId: row.orderId,
        businessId: row.businessId,
        payload: row.payload,
        eventCreatedAt: row.eventCreatedAt,
        attemptCount: row.attemptCount,
      });
    }
  }

  return claimed;
};

const markOutboxSuccess = async (ids: string[]) => {
  if (ids.length === 0) return;
  await prisma.orderEventOutbox.updateMany({
    where: { id: { in: ids } },
    data: { status: "done", processedAt: new Date(), lastError: null },
  });
};

const markOutboxFailure = async ({
  id,
  attemptCount,
  errorMessage,
}: {
  id: string;
  attemptCount: number;
  errorMessage: string;
}) => {
  const nextAttemptCount = attemptCount + 1;
  const nextDelay = Math.min(
    outboxBaseBackoffMs * Math.pow(2, Math.max(0, nextAttemptCount - 1)),
    24 * 60 * 60 * 1000
  );
  await prisma.orderEventOutbox.update({
    where: { id },
    data: {
      status: "failed",
      attemptCount: nextAttemptCount,
      lastError: errorMessage.slice(0, 300),
      nextAttemptAt: nextAttemptCount >= outboxMaxAttempts ? null : new Date(Date.now() + nextDelay),
    },
  });
};

const publishToQueue = async (events: ReturnType<typeof claimPendingEvents>) => {
  if (events.length === 0) return;
  await publishOrderEventsToQueue(
    events.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      orderId: event.orderId,
      businessId: event.businessId,
      payload: event.payload,
      eventCreatedAt: event.eventCreatedAt,
    }))
  );
};

export const runOrderEventOutboxOnce = async () => {
  if (!isOutboxEnabled) return;
  if (outboxInFlight) return;

  outboxInFlight = true;
  try {
    const events = await claimPendingEvents();
    if (events.length === 0) return;

    logger.info("outbox.order_events.started", { count: events.length });

    try {
      await publishToQueue(events);
      await markOutboxSuccess(events.map((event) => event.id));
      logger.info("outbox.order_events.finished", { success: events.length, failed: 0 });
    } catch (error) {
      logger.warn("outbox.order_events.flush_failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      for (const event of events) {
        await markOutboxFailure({
          id: event.id,
          attemptCount: event.attemptCount,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    outboxInFlight = false;
  }
};

export const startOrderEventOutboxWorker = () => {
  if (!isOutboxEnabled) {
    logger.info("outbox.order_events.disabled");
    return;
  }
  if (outboxTimer) return;

  logger.info("outbox.order_events.worker_started", {
    intervalMs: outboxIntervalMs,
    batchSize: outboxBatchSize,
    maxAttempts: outboxMaxAttempts,
    stream: orderEventStream,
    streamMaxLen: orderEventStreamMaxLen || null,
  });

  outboxTimer = setInterval(() => {
    void runOrderEventOutboxOnce().catch((error) => {
      logger.warn("outbox.order_events.tick_failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }, outboxIntervalMs);

  void runOrderEventOutboxOnce().catch((error) => {
    logger.warn("outbox.order_events.bootstrap_failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });
};

export const stopOrderEventOutboxWorker = () => {
  if (!outboxTimer) return;
  clearInterval(outboxTimer);
  outboxTimer = null;
};
