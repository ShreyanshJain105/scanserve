import type { OrderStatus } from "./types";

// Order status flow — defines valid transitions
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};

// Dietary tag options available for menu items
export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "halal",
  "kosher",
  "spicy",
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];
