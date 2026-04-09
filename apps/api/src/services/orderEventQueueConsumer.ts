import { logger } from "../utils/logger";
import { getOrderEventRedisClient, getOrderEventStreamName } from "./orderEventQueue";

const isConsumerEnabled =
  (process.env.ENABLE_ORDER_EVENT_QUEUE_CONSUMER || "true").toLowerCase() !== "false";
const consumerBatchSize = Number(process.env.ORDER_EVENT_QUEUE_CONSUMER_BATCH_SIZE || 200);
const consumerBlockMs = Number(process.env.ORDER_EVENT_QUEUE_CONSUMER_BLOCK_MS || 5000);
const consumerGroup = process.env.ORDER_EVENT_QUEUE_CONSUMER_GROUP || "order_events_clickhouse";
const consumerName =
  process.env.ORDER_EVENT_QUEUE_CONSUMER_NAME ||
  `${process.env.HOSTNAME || "consumer"}-${process.pid}`;

const clickhouseUrl = process.env.CLICKHOUSE_URL || "http://localhost:8123";
const clickhouseUser =
  process.env.CLICKHOUSE_INGEST_USER || process.env.CLICKHOUSE_USER || "default";
const clickhousePassword =
  process.env.CLICKHOUSE_INGEST_PASSWORD || process.env.CLICKHOUSE_PASSWORD || "";
const clickhouseBootstrapUser =
  process.env.CLICKHOUSE_BOOTSTRAP_USER || process.env.CLICKHOUSE_USER || "default";
const clickhouseBootstrapPassword =
  process.env.CLICKHOUSE_BOOTSTRAP_PASSWORD || process.env.CLICKHOUSE_PASSWORD || "";
const clickhouseDatabase = process.env.CLICKHOUSE_DATABASE || "scan2serve";

let consumerTimer: NodeJS.Timeout | null = null;
let consumerInFlight = false;
let clickhouseReady = false;
let consumerGroupReady = false;

const orderEventStream = getOrderEventStreamName();

const formatClickhouseDate = (date: Date) =>
  date.toISOString().replace("T", " ").replace("Z", "");

const buildAuthHeader = (user: string, password: string) => {
  if (!user && !password) return undefined;
  const token = Buffer.from(`${user}:${password}`).toString("base64");
  return `Basic ${token}`;
};

const runClickhouseQuery = async (
  query: string,
  auth?: { user: string; password: string }
) => {
  const headers: Record<string, string> = {
    "Content-Type": "text/plain",
  };
  const authHeader = auth ? buildAuthHeader(auth.user, auth.password) : undefined;
  if (authHeader) headers.Authorization = authHeader;

  const response = await fetch(clickhouseUrl, {
    method: "POST",
    headers,
    body: query,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `ClickHouse query failed (${response.status})`);
  }
};

const ensureClickhouseSchema = async () => {
  if (clickhouseReady) return;
  await runClickhouseQuery(`CREATE DATABASE IF NOT EXISTS ${clickhouseDatabase}`, {
    user: clickhouseBootstrapUser,
    password: clickhouseBootstrapPassword,
  });
  await runClickhouseQuery(`
    CREATE TABLE IF NOT EXISTS ${clickhouseDatabase}.order_events (
      event_id String,
      event_type String,
      event_created_at DateTime,
      order_id String,
      business_id String,
      payload String,
      ingested_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree
    ORDER BY (order_id, event_id)
  `, {
    user: clickhouseBootstrapUser,
    password: clickhouseBootstrapPassword,
  });
  clickhouseReady = true;
};

const ensureConsumerGroup = async () => {
  if (consumerGroupReady) return;
  const client = await getOrderEventRedisClient();
  try {
    await client.xGroupCreate(orderEventStream, consumerGroup, "0", { MKSTREAM: true });
    logger.info("queue.order_events.group_created", {
      stream: orderEventStream,
      group: consumerGroup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("BUSYGROUP")) {
      throw error;
    }
  }
  consumerGroupReady = true;
};

type StreamMessage = {
  id: string;
  message: Record<string, string>;
};

const readStreamBatch = async (id: string, blockMs?: number) => {
  const client = await getOrderEventRedisClient();
  await ensureConsumerGroup();

  const response = await client.xReadGroup(
    consumerGroup,
    consumerName,
    [{ key: orderEventStream, id }],
    {
      COUNT: consumerBatchSize,
      BLOCK: blockMs,
    }
  );

  if (!response) return [] as StreamMessage[];
  return response.flatMap((stream) => stream.messages as StreamMessage[]);
};

const flushToClickhouse = async (messages: StreamMessage[]) => {
  if (messages.length === 0) return;
  await ensureClickhouseSchema();

  const rows = messages.map((message) => {
    const eventCreatedAt = new Date(message.message.eventCreatedAt || new Date());
    return JSON.stringify({
      event_id: message.message.eventId,
      event_type: message.message.eventType,
      event_created_at: formatClickhouseDate(eventCreatedAt),
      order_id: message.message.orderId,
      business_id: message.message.businessId,
      payload: message.message.payload || "{}",
    });
  });

  const body = `INSERT INTO ${clickhouseDatabase}.order_events FORMAT JSONEachRow\n${rows.join("\n")}`;
  await runClickhouseQuery(body, {
    user: clickhouseUser,
    password: clickhousePassword,
  });
};

const ackMessages = async (messages: StreamMessage[]) => {
  if (messages.length === 0) return;
  const client = await getOrderEventRedisClient();
  const ids = messages.map((message) => message.id);
  await client.xAck(orderEventStream, consumerGroup, ids);
};

export const runOrderEventQueueConsumerOnce = async () => {
  if (!isConsumerEnabled) return;
  if (consumerInFlight) return;

  consumerInFlight = true;
  try {
    const pendingMessages = await readStreamBatch("0", 0);
    if (pendingMessages.length > 0) {
      logger.info("queue.order_events.pending_found", { count: pendingMessages.length });
      await flushToClickhouse(pendingMessages);
      await ackMessages(pendingMessages);
      logger.info("queue.order_events.pending_flushed", { count: pendingMessages.length });
    }

    const messages = await readStreamBatch(">", consumerBlockMs);
    if (messages.length === 0) return;

    logger.info("queue.order_events.started", { count: messages.length });

    await flushToClickhouse(messages);
    await ackMessages(messages);
    logger.info("queue.order_events.finished", { count: messages.length });
  } catch (error) {
    logger.warn("queue.order_events.failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } finally {
    consumerInFlight = false;
  }
};

export const startOrderEventQueueConsumer = () => {
  if (!isConsumerEnabled) {
    logger.info("queue.order_events.disabled");
    return;
  }
  if (consumerTimer) return;

  logger.info("queue.order_events.worker_started", {
    stream: orderEventStream,
    group: consumerGroup,
    consumer: consumerName,
    batchSize: consumerBatchSize,
    blockMs: consumerBlockMs,
    clickhouseUrl,
    clickhouseDatabase,
  });

  consumerTimer = setInterval(() => {
    void runOrderEventQueueConsumerOnce();
  }, Math.max(1000, consumerBlockMs));

  void runOrderEventQueueConsumerOnce();
};

export const stopOrderEventQueueConsumer = () => {
  if (!consumerTimer) return;
  clearInterval(consumerTimer);
  consumerTimer = null;
};
