import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import businessRouter from "../src/routes/business";

type BusinessStatus = "pending" | "approved" | "rejected" | "archived";
type UserRecord = { id: string; email: string; role: "business" | "admin" | "customer" };
type BusinessRecord = { id: string; userId: string; status: BusinessStatus; blocked?: boolean };
type TableRecord = { id: string; businessId: string; tableNumber: number; label: string | null };
type MenuItemRecord = { id: string; name: string };
type OrderRecord = {
  id: string;
  businessId: string;
  tableId: string;
  status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
  totalAmount: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentStatus: "pending" | "unpaid" | "paid" | "failed" | "refunded";
  paymentMethod: "razorpay" | "cash";
  customerName: string;
  customerPhone: string | null;
  statusActors?: Record<string, { userId: string | null; email: string | null }>;
  paymentActors?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};
type OrderItemRecord = {
  id: string;
  orderId: string;
  orderCreatedAt?: Date;
  menuItemId: string;
  quantity: number;
  unitPrice: string;
  specialInstructions: string | null;
};
type BusinessMembershipRecord = {
  id: string;
  businessId: string;
  userId: string;
  role: "owner" | "manager" | "staff";
};
type OrderPinRecord = {
  id: string;
  orderId: string;
  orderCreatedAt: Date;
  businessId: string;
  userId: string;
  pinnedAt: Date;
};

const users: UserRecord[] = [];
const businesses: BusinessRecord[] = [];
const tables: TableRecord[] = [];
const menuItems: MenuItemRecord[] = [];
const orders: OrderRecord[] = [];
const orderItems: OrderItemRecord[] = [];
const businessMemberships: BusinessMembershipRecord[] = [];
const orderPins: OrderPinRecord[] = [];

const nextOrderId = () => `order_${orders.length + 1}`;
const nextOrderItemId = () => `oi_${orderItems.length + 1}`;
const nextBizMembershipId = () => `bizmem_${businessMemberships.length + 1}`;
const nextOrderPinId = () => `pin_${orderPins.length + 1}`;

vi.mock("../src/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }) => {
        if (where?.id) return users.find((u) => u.id === where.id) ?? null;
        if (where?.email) return users.find((u) => u.email === where.email) ?? null;
        return null;
      }),
    },
    business: {
      findFirst: vi.fn(async ({ where }) => {
        let list = [...businesses];
        if (where?.id) list = list.filter((b) => b.id === where.id);
        if (where?.userId) list = list.filter((b) => b.userId === where.userId);
        return list[0] ?? null;
      }),
      findMany: vi.fn(async ({ where }) => {
        let list = [...businesses];
        if (where?.userId) list = list.filter((b) => b.userId === where.userId);
        return list;
      }),
    },
    businessRejection: {
      findFirst: vi.fn(async () => null),
    },
    businessMembership: {
      findMany: vi.fn(async ({ where, include }) => {
        const list = businessMemberships.filter(
          (m) => (!where?.userId ? true : m.userId === where.userId)
        );
        if (include?.business) {
          return list.map((m) => ({
            ...m,
            business: businesses.find((b) => b.id === m.businessId) ?? null,
          }));
        }
        return list;
      }),
      findFirst: vi.fn(async ({ where }) =>
        businessMemberships.find(
          (m) =>
            (!where?.businessId || m.businessId === where.businessId) &&
            (!where?.userId || m.userId === where.userId)
        ) ?? null
      ),
      create: vi.fn(async ({ data }) => {
        const record = {
          id: nextBizMembershipId(),
          businessId: data.businessId,
          userId: data.userId,
          role: data.role,
        };
        businessMemberships.push(record);
        return record;
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where, include, select }) => {
        let list = orders.filter((o) => (where?.businessId ? o.businessId === where.businessId : true));
        if (where?.id) list = list.filter((o) => o.id === where.id);
        if (where?.status) list = list.filter((o) => o.status === where.status);
        const order = list[0] ?? null;
        if (!order) return null;
        if (select) {
          return {
            id: order.id,
            createdAt: order.createdAt,
          };
        }
        const table = tables.find((t) => t.id === order.tableId) ?? null;
        const items = orderItems
          .filter((item) => item.orderId === order.id)
          .map((item) => ({
            ...item,
            menuItem: menuItems.find((m) => m.id === item.menuItemId) ?? null,
          }));
        if (include?.items && include?.table) {
          return { ...order, table, items };
        }
        if (include?.items) {
          return { ...order, items };
        }
        if (include?.table) {
          return { ...order, table };
        }
        return order;
      }),
      findUnique: vi.fn(async ({ where, include }) => {
        if (!where?.id) return null;
        const order = orders.find((o) => o.id === where.id) ?? null;
        if (!order) return null;
        const items = orderItems
          .filter((item) => item.orderId === order.id)
          .map((item) => ({
            ...item,
            menuItem: menuItems.find((m) => m.id === item.menuItemId) ?? null,
          }));
        if (include?.items) {
          return { ...order, items };
        }
        return order;
      }),
      findMany: vi.fn(async ({ where, orderBy, take, include }) => {
        let list = orders.filter((o) => (where?.businessId ? o.businessId === where.businessId : true));
        if (where?.status) list = list.filter((o) => o.status === where.status);
        if (where?.OR?.length) {
          const [ruleA, ruleB] = where.OR;
          list = list.filter((o) => {
            const ltRule = ruleA?.createdAt?.lt
              ? o.createdAt < ruleA.createdAt.lt
              : true;
            const eqRule = ruleB?.createdAt
              ? o.createdAt.getTime() === ruleB.createdAt.getTime() &&
                o.id < (ruleB.id?.lt ?? "")
              : true;
            return ltRule || eqRule;
          });
        }
        if (orderBy?.length) {
          list.sort((a, b) => {
            if (a.createdAt.getTime() !== b.createdAt.getTime()) {
              return b.createdAt.getTime() - a.createdAt.getTime();
            }
            return b.id.localeCompare(a.id);
          });
        }
        const limited = take ? list.slice(0, take) : list;
        if (include?.table) {
          return limited.map((order) => ({
            ...order,
            table: tables.find((t) => t.id === order.tableId) ?? null,
          }));
        }
        return limited;
      }),
      update: vi.fn(async ({ where, data, include }) => {
        const targetId = where?.id_createdAt?.id ?? where?.id;
        const order = orders.find((o) => o.id === targetId);
        if (!order) return null;
        Object.assign(order, data, { updatedAt: new Date() });
        const table = tables.find((t) => t.id === order.tableId) ?? null;
        if (include?.table) {
          return { ...order, table };
        }
        return order;
      }),
    },
    orderItem: {
      createMany: vi.fn(async ({ data }) => {
        data.forEach((entry: any) => {
          orderItems.push({ id: nextOrderItemId(), ...entry });
        });
        return { count: data.length };
      }),
    },
    orderPin: {
      findMany: vi.fn(async ({ where, orderBy, take, include }) => {
        let list = orderPins.filter(
          (pin) =>
            (!where?.userId || pin.userId === where.userId) &&
            (!where?.businessId || pin.businessId === where.businessId)
        );
        if (where?.order?.status) {
          list = list.filter((pin) => {
            const order = orders.find((o) => o.id === pin.orderId);
            return order?.status === where.order.status;
          });
        }
        if (where?.order?.updatedAt?.gte || where?.order?.updatedAt?.lt) {
          list = list.filter((pin) => {
            const order = orders.find((o) => o.id === pin.orderId);
            if (!order) return false;
            if (where.order.updatedAt?.gte && order.updatedAt < where.order.updatedAt.gte) {
              return false;
            }
            if (where.order.updatedAt?.lt && order.updatedAt >= where.order.updatedAt.lt) {
              return false;
            }
            return true;
          });
        }
        if (orderBy?.pinnedAt === "desc") {
          list.sort((a, b) => b.pinnedAt.getTime() - a.pinnedAt.getTime());
        }
        if (typeof take === "number") {
          list = list.slice(0, take);
        }
        if (include?.order) {
          return list.map((pin) => {
            const order = orders.find((o) => o.id === pin.orderId) ?? null;
            const table = order ? tables.find((t) => t.id === order.tableId) ?? null : null;
            return {
              ...pin,
              order: order
                ? include?.order?.include?.table
                  ? { ...order, table }
                  : order
                : null,
            };
          });
        }
        return list;
      }),
      findFirst: vi.fn(async ({ where }) => {
        return (
          orderPins.find(
            (pin) =>
              (!where?.userId || pin.userId === where.userId) &&
              (!where?.businessId || pin.businessId === where.businessId) &&
              (!where?.orderId || pin.orderId === where.orderId) &&
              (!where?.orderCreatedAt ||
                pin.orderCreatedAt.getTime() === where.orderCreatedAt.getTime())
          ) ?? null
        );
      }),
      count: vi.fn(async ({ where }) => {
        return orderPins.filter(
          (pin) =>
            (!where?.userId || pin.userId === where.userId) &&
            (!where?.businessId || pin.businessId === where.businessId)
        ).length;
      }),
      create: vi.fn(async ({ data }) => {
        const record = {
          id: nextOrderPinId(),
          orderId: data.orderId,
          orderCreatedAt: data.orderCreatedAt,
          businessId: data.businessId,
          userId: data.userId,
          pinnedAt: new Date(),
        };
        orderPins.push(record);
        return record;
      }),
      delete: vi.fn(async ({ where }) => {
        const idx = orderPins.findIndex((pin) => pin.id === where.id);
        if (idx >= 0) {
          const [deleted] = orderPins.splice(idx, 1);
          return deleted;
        }
        return null;
      }),
    },
  },
}));

vi.stubEnv("NODE_ENV", "test");

const waitForResponseEnd = async (res: ReturnType<typeof createMocks>["res"]) => {
  const maxTicks = 200;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (res.writableEnded || res._isEndCalled()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Mock response did not complete");
};

const makeToken = (user: UserRecord) =>
  jwt.sign({ sub: user.id, role: user.role, email: user.email }, "dev-secret", {
    expiresIn: "15m",
  });

const run = async (
  method: string,
  url: string,
  {
    body,
    user,
    headers,
  }: {
    body?: unknown;
    user?: UserRecord;
    headers?: Record<string, string>;
  } = {}
) => {
  const token = user ? makeToken(user) : null;
  const { req, res } = createMocks({
    method,
    url,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = token ? { access_token: token } : {};

  businessRouter.handle(req, res, (err: unknown) => {
    if (err) throw err;
  });

  await waitForResponseEnd(res);
  return res;
};

describe("Layer 8 order management routes", () => {
  beforeEach(() => {
    users.length = 0;
    businesses.length = 0;
    tables.length = 0;
    menuItems.length = 0;
    orders.length = 0;
    orderItems.length = 0;
    businessMemberships.length = 0;
    orderPins.length = 0;

    users.push({ id: "u_business", email: "biz@example.com", role: "business" });
    businesses.push({ id: "b_1", userId: "u_business", status: "approved" });
    tables.push({ id: "t_1", businessId: "b_1", tableNumber: 1, label: "Main" });
    menuItems.push({ id: "m_1", name: "Samosa" });
  });

  it("lists orders with status filter and cursor", async () => {
    orders.push({
      id: "order_1",
      businessId: "b_1",
      tableId: "t_1",
      status: "pending",
      totalAmount: "100.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      customerName: "Asha",
      customerPhone: null,
      createdAt: new Date("2026-03-27T10:00:00Z"),
      updatedAt: new Date("2026-03-27T10:00:00Z"),
    });
    orders.push({
      id: "order_2",
      businessId: "b_1",
      tableId: "t_1",
      status: "pending",
      totalAmount: "120.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      customerName: "Ravi",
      customerPhone: null,
      createdAt: new Date("2026-03-27T09:00:00Z"),
      updatedAt: new Date("2026-03-27T09:00:00Z"),
    });
    orders.push({
      id: "order_3",
      businessId: "b_1",
      tableId: "t_1",
      status: "completed",
      totalAmount: "80.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "paid",
      paymentMethod: "razorpay",
      customerName: "Meera",
      customerPhone: null,
      createdAt: new Date("2026-03-27T08:00:00Z"),
      updatedAt: new Date("2026-03-27T08:00:00Z"),
    });

    const user = users[0];
    const first = await run("GET", "/orders?status=pending&limit=1", { user });
    const firstBody = JSON.parse(first._getData());
    expect(first.statusCode).toBe(200);
    expect(firstBody.data.orders).toHaveLength(1);
    expect(firstBody.data.orders[0].customerName).toBe("Asha");
    expect(firstBody.data.nextCursor).toBeTruthy();

    const second = await run(
      "GET",
      `/orders?status=pending&limit=1&cursor=${firstBody.data.nextCursor}`,
      { user }
    );
    const secondBody = JSON.parse(second._getData());
    expect(second.statusCode).toBe(200);
    expect(secondBody.data.orders).toHaveLength(1);
    expect(secondBody.data.orders[0].customerName).toBe("Ravi");
  });

  it("returns order detail with items", async () => {
    const orderId = nextOrderId();
    orders.push({
      id: orderId,
      businessId: "b_1",
      tableId: "t_1",
      status: "pending",
      totalAmount: "90.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      customerName: "Priya",
      customerPhone: "999999",
      createdAt: new Date("2026-03-27T10:00:00Z"),
      updatedAt: new Date("2026-03-27T10:00:00Z"),
    });
    orderItems.push({
      id: nextOrderItemId(),
      orderId,
      menuItemId: "m_1",
      quantity: 2,
      unitPrice: "45.00",
      specialInstructions: "Extra chutney",
    });

    const user = users[0];
    const res = await run("GET", `/orders/${orderId}`, { user });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.order.items).toHaveLength(1);
    expect(body.data.order.items[0].name).toBe("Samosa");
  });

  it("rejects invalid status transitions", async () => {
    const orderId = nextOrderId();
    orders.push({
      id: orderId,
      businessId: "b_1",
      tableId: "t_1",
      status: "pending",
      totalAmount: "90.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      customerName: "Priya",
      customerPhone: null,
      createdAt: new Date("2026-03-27T10:00:00Z"),
      updatedAt: new Date("2026-03-27T10:00:00Z"),
    });

    const user = users[0];
    const res = await run("PATCH", `/orders/${orderId}/status`, {
      user,
      body: { status: "ready" },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(400);
    expect(body.error.code).toBe("INVALID_ORDER_STATUS_TRANSITION");
  });

  it("allows cancel from pending", async () => {
    const orderId = nextOrderId();
    orders.push({
      id: orderId,
      businessId: "b_1",
      tableId: "t_1",
      status: "pending",
      totalAmount: "90.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      customerName: "Priya",
      customerPhone: null,
      createdAt: new Date("2026-03-27T10:00:00Z"),
      updatedAt: new Date("2026-03-27T10:00:00Z"),
    });

    const user = users[0];
    const res = await run("PATCH", `/orders/${orderId}/status`, {
      user,
      body: { status: "cancelled" },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.order.status).toBe("cancelled");
  });

  it("marks cash orders as paid", async () => {
    const orderId = nextOrderId();
    orders.push({
      id: orderId,
      businessId: "b_1",
      tableId: "t_1",
      status: "pending",
      totalAmount: "75.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "unpaid",
      paymentMethod: "cash",
      customerName: "Rina",
      customerPhone: null,
      createdAt: new Date("2026-03-27T10:00:00Z"),
      updatedAt: new Date("2026-03-27T10:00:00Z"),
    });

    const user = users[0];
    const res = await run("PATCH", `/orders/${orderId}/mark-paid`, { user });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.order.paymentStatus).toBe("paid");
    expect(body.data.order.paymentActors?.paidBy?.email).toBe("biz@example.com");
    expect(body.data.order.paymentActors?.paidAt).toBeTruthy();
  });

  it("rejects completing unpaid orders", async () => {
    const orderId = nextOrderId();
    orders.push({
      id: orderId,
      businessId: "b_1",
      tableId: "t_1",
      status: "ready",
      totalAmount: "55.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "unpaid",
      paymentMethod: "cash",
      customerName: "Rina",
      customerPhone: null,
      createdAt: new Date("2026-03-27T10:00:00Z"),
      updatedAt: new Date("2026-03-27T10:00:00Z"),
    });

    const user = users[0];
    const res = await run("PATCH", `/orders/${orderId}/status`, {
      user,
      body: { status: "completed" },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(400);
    expect(body.error.code).toBe("ORDER_NOT_PAID");
  });

  it("pins and unpins orders", async () => {
    const orderId = nextOrderId();
    const createdAt = new Date("2026-03-27T10:00:00Z");
    orders.push({
      id: orderId,
      businessId: "b_1",
      tableId: "t_1",
      status: "pending",
      totalAmount: "75.00",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      paymentStatus: "unpaid",
      paymentMethod: "cash",
      customerName: "Rina",
      customerPhone: null,
      createdAt,
      updatedAt: createdAt,
    });

    const user = users[0];
    const pinRes = await run("PATCH", `/orders/${orderId}/pin`, {
      user,
      body: { pinned: true },
    });
    const pinBody = JSON.parse(pinRes._getData());
    expect(pinRes.statusCode).toBe(200);
    expect(pinBody.data.pinned).toBe(true);

    const unpinRes = await run("PATCH", `/orders/${orderId}/pin`, {
      user,
      body: { pinned: false },
    });
    const unpinBody = JSON.parse(unpinRes._getData());
    expect(unpinRes.statusCode).toBe(200);
    expect(unpinBody.data.pinned).toBe(false);
  });

  it("enforces per-user pin limit", async () => {
    const user = users[0];
    const createdAt = new Date("2026-03-27T10:00:00Z");
    for (let i = 0; i < 4; i += 1) {
      orders.push({
        id: `order_pin_${i + 1}`,
        businessId: "b_1",
        tableId: "t_1",
        status: "pending",
        totalAmount: "10.00",
        razorpayOrderId: null,
        razorpayPaymentId: null,
        paymentStatus: "pending",
        paymentMethod: "cash",
        customerName: "Pin User",
        customerPhone: null,
        createdAt: new Date(createdAt.getTime() + i * 1000),
        updatedAt: new Date(createdAt.getTime() + i * 1000),
      });
    }

    await run("PATCH", `/orders/order_pin_1/pin`, { user, body: { pinned: true } });
    await run("PATCH", `/orders/order_pin_2/pin`, { user, body: { pinned: true } });
    await run("PATCH", `/orders/order_pin_3/pin`, { user, body: { pinned: true } });

    const res = await run("PATCH", `/orders/order_pin_4/pin`, {
      user,
      body: { pinned: true },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(409);
    expect(body.error.code).toBe("PIN_LIMIT_REACHED");
  });
});
