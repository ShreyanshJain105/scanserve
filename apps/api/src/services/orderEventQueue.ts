import type { RedisClientType } from "redis";
import { getRedisClient } from "./redisClient";

const orderEventStream = process.env.ORDER_EVENT_STREAM || "order_events";
const orderEventStreamMaxLen = Number(process.env.ORDER_EVENT_STREAM_MAXLEN || 0);

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

export const getOrderEventRedisClient = async (): Promise<RedisClientType> => getRedisClient();

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
