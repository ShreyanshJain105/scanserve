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
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  customerName: string;
  customerPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type OrderItemRecord = {
  id: string;
  orderId: string;
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

const users: UserRecord[] = [];
const businesses: BusinessRecord[] = [];
const tables: TableRecord[] = [];
const menuItems: MenuItemRecord[] = [];
const orders: OrderRecord[] = [];
const orderItems: OrderItemRecord[] = [];
const businessMemberships: BusinessMembershipRecord[] = [];

const nextOrderId = () => `order_${orders.length + 1}`;
const nextOrderItemId = () => `oi_${orderItems.length + 1}`;
const nextBizMembershipId = () => `bizmem_${businessMemberships.length + 1}`;

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
        const order = orders.find((o) => o.id === where.id);
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
});
