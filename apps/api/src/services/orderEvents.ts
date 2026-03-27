import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { logger } from "../utils/logger";

export type OrderEventType = "order_created" | "order_status_updated" | "order_payment_updated";

export type OrderSnapshot = {
  id: string;
  businessId: string;
  tableId: string;
  status: string;
  totalAmount: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentStatus: string;
  customerName: string;
  customerPhone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderItemSnapshot = {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: string;
  specialInstructions: string | null;
};

export const buildOrderSnapshot = (order: {
  id: string;
  businessId: string;
  tableId: string;
  status: string;
  totalAmount: Prisma.Decimal;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentStatus: string;
  customerName: string;
  customerPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrderSnapshot => ({
  id: order.id,
  businessId: order.businessId,
  tableId: order.tableId,
  status: order.status,
  totalAmount: order.totalAmount.toString(),
  razorpayOrderId: order.razorpayOrderId,
  razorpayPaymentId: order.razorpayPaymentId,
  paymentStatus: order.paymentStatus,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
});

export const buildItemSnapshots = (items: Array<{
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  specialInstructions: string | null;
}>): OrderItemSnapshot[] =>
  items.map((item) => ({
    id: item.id,
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
    specialInstructions: item.specialInstructions,
  }));

export const fetchOrderSnapshot = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return null;
  return {
    order: buildOrderSnapshot(order),
    items: buildItemSnapshots(order.items),
  };
};

export const publishOrderEvent = async (params: {
  type: OrderEventType;
  order: OrderSnapshot;
  items: OrderItemSnapshot[];
  eventCreatedAt?: Date;
}) => {
  const eventCreatedAt = params.eventCreatedAt ?? new Date();
  const payload = {
    eventId: crypto.randomUUID(),
    eventType: params.type,
    eventCreatedAt: eventCreatedAt.toISOString(),
    order: params.order,
    items: params.items,
  };

  // TODO: replace with real queue producer (Kafka/SQS/etc.) feeding ClickHouse pipeline.
  logger.info("order.event.published", payload);
  return payload;
};

export const publishOrderEventBestEffort = async (params: {
  type: OrderEventType;
  order: OrderSnapshot;
  items: OrderItemSnapshot[];
  eventCreatedAt?: Date;
}) => {
  try {
    await publishOrderEvent(params);
  } catch (err) {
    logger.warn("order.event.publish_failed", {
      eventType: params.type,
      orderId: params.order.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
