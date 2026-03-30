import { createClient, RedisClientType } from "redis";
import { logger } from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const orderEventStream = process.env.ORDER_EVENT_STREAM || "order_events";
const orderEventStreamMaxLen = Number(process.env.ORDER_EVENT_STREAM_MAXLEN || 0);

let redisClient: RedisClientType | null = null;
let redisConnecting: Promise<RedisClientType> | null = null;

export type OrderEventQueueEvent = {
  eventId: string;
  eventType: string;
  orderId: string;
  businessId: string;
  payload: unknown;
  eventCreatedAt: Date;
};

export const getOrderEventStreamName = () => orderEventStream;
export const getOrderEventStreamMaxLen = () => orderEventStreamMaxLen;

export const getOrderEventRedisClient = async () => {
  if (redisClient?.isOpen) return redisClient;
  if (redisConnecting) return redisConnecting;

  redisClient = createClient({ url: redisUrl });
  redisClient.on("error", (error) => {
    logger.warn("redis.client.error", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });

  redisConnecting = redisClient
    .connect()
    .then(() => {
      logger.info("redis.client.connected", { url: redisUrl });
      return redisClient as RedisClientType;
    })
    .finally(() => {
      redisConnecting = null;
    });

  return redisConnecting;
};

const buildXAddArgs = (event: OrderEventQueueEvent) => {
  const payload = JSON.stringify(event.payload ?? {});
  const fields = [
    "eventId",
    event.eventId,
    "eventType",
    event.eventType,
    "orderId",
    event.orderId,
    "businessId",
    event.businessId,
    "eventCreatedAt",
    event.eventCreatedAt.toISOString(),
    "payload",
    payload,
  ];

  const args = ["XADD", orderEventStream];
  if (orderEventStreamMaxLen > 0) {
    args.push("MAXLEN", "~", String(orderEventStreamMaxLen));
  }
  args.push("*", ...fields);
  return args;
};

export const publishOrderEventsToQueue = async (events: OrderEventQueueEvent[]) => {
  if (events.length === 0) return;

  const client = await getOrderEventRedisClient();
  const multi = client.multi();

  for (const event of events) {
    multi.sendCommand(buildXAddArgs(event));
  }

  await multi.exec();
};
