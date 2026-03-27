import { EventEmitter } from "events";
import { createHmac } from "crypto";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import publicRouter from "../src/routes/public";

const ensureDecimal = () => {
  if ((Prisma as unknown as { Decimal?: unknown }).Decimal) return;
  class TestDecimal {
    private value: number;

    constructor(input: string | number) {
      this.value = typeof input === "string" ? Number.parseFloat(input) : input;
    }

    plus(other: TestDecimal | string | number) {
      const next =
        other instanceof TestDecimal
          ? other.value
          : typeof other === "string"
            ? Number.parseFloat(other)
            : other;
      return new TestDecimal(this.value + next);
    }

    mul(other: TestDecimal | number) {
      const next = other instanceof TestDecimal ? other.value : other;
      return new TestDecimal(this.value * next);
    }

    toString() {
      return this.value.toFixed(2);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Prisma as any).Decimal = TestDecimal;
};

ensureDecimal();

const store = vi.hoisted(() => ({
  qrCodes: [] as any[],
  qrRotations: [] as any[],
  businesses: [] as any[],
  tables: [] as any[],
  categories: [] as any[],
  menuItems: [] as any[],
  orders: [] as any[],
  orderItems: [] as any[],
}));

const prismaMock = vi.hoisted(() => ({
  qrCode: {
    findUnique: vi.fn(async ({ where: { uniqueCode } }) =>
      store.qrCodes.find((q) => q.uniqueCode === uniqueCode) || null
    ),
  },
  qrCodeRotation: {
    findFirst: vi.fn(async ({ where: { oldToken } }) =>
      store.qrRotations
        .filter((r) => r.oldToken === oldToken && (!r.graceExpiresAt || r.graceExpiresAt > new Date()))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null
    ),
  },
  business: {
    findUnique: vi.fn(async ({ where }) => {
      if ("slug" in where) {
        return store.businesses.find((b) => b.slug === where.slug) || null;
      }
      if ("id" in where) {
        return store.businesses.find((b) => b.id === where.id) || null;
      }
      return null;
    }),
  },
  table: {
    findUnique: vi.fn(async ({ where: { businessId_tableNumber } }) =>
      store.tables.find(
        (t) =>
          t.businessId === businessId_tableNumber.businessId &&
          t.tableNumber === businessId_tableNumber.tableNumber
      ) || null
    ),
    findFirst: vi.fn(async ({ where }) =>
      store.tables.find((t) => t.id === where.id && t.businessId === where.businessId) || null
    ),
  },
  category: {
    findMany: vi.fn(async ({ where: { businessId } }) =>
      store.categories
        .filter((c) => c.businessId === businessId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({
          ...c,
          menuItems: [...(c.menuItems || [])].sort((a, b) => a.sortOrder - b.sortOrder),
        }))
    ),
  },
  menuItem: {
    findMany: vi.fn(async ({ where: { id, businessId } }) =>
      store.menuItems.filter(
        (item) => id.in.includes(item.id) && item.businessId === businessId
      )
    ),
  },
  order: {
    create: vi.fn(async ({ data }) => {
      const record = {
        ...data,
        id: `order-${store.orders.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.orders.push(record);
      return record;
    }),
    findUnique: vi.fn(async ({ where: { id }, include }) => {
      const order = store.orders.find((entry) => entry.id === id);
      if (!order) return null;
      const items = store.orderItems.filter((item) => item.orderId === order.id);
      const business = store.businesses.find((b) => b.id === order.businessId) || null;
      if (include?.items && include?.business) {
        return { ...order, items, business };
      }
      if (include?.items) {
        return { ...order, items };
      }
      if (include?.business) {
        return { ...order, business };
      }
      return order;
    }),
    update: vi.fn(async ({ where: { id }, data }) => {
      const order = store.orders.find((entry) => entry.id === id);
      if (!order) return null;
      Object.assign(order, data, { updatedAt: new Date() });
      return order;
    }),
  },
  orderItem: {
    createMany: vi.fn(async ({ data }) => {
      data.forEach((entry: any) => {
        store.orderItems.push({ id: `oi-${store.orderItems.length + 1}`, ...entry });
      });
      return { count: data.length };
    }),
  },
  $transaction: vi.fn(async (callback: any) => callback(prismaMock)),
}));

vi.mock("../src/prisma", () => ({
  prisma: prismaMock,
}));

const razorpayCreateMock = vi.hoisted(() => vi.fn());

vi.mock("../src/services/razorpay", () => ({
  getRazorpay: () => ({
    orders: {
      create: razorpayCreateMock,
    },
  }),
}));

type SupportedMethod = "get" | "post";

const getRouteHandler = (method: SupportedMethod, path: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (publicRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
};

const waitForResponseEnd = async (res: ReturnType<typeof createMocks>["res"]) => {
  const maxTicks = 100;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (res.writableEnded || res._isEndCalled()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Mock response did not complete");
};

const runQr = async (path: string, params?: Record<string, string>) => {
  const { req, res } = createMocks({
    method: "GET",
    url: path,
    eventEmitter: EventEmitter,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).params = params ?? {};
  const handler = getRouteHandler("get", "/qr/:qrToken");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runMenu = async (path: string, params?: Record<string, string>, query?: Record<string, string>) => {
  const { req, res } = createMocks({
    method: "GET",
    url: path,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).params = params ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).query = query ?? {};
  const handler = getRouteHandler("get", "/menu/:slug");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runOrderCreate = async (body: Record<string, unknown>) => {
  const { req, res } = createMocks({
    method: "POST",
    url: "/orders",
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = body;
  const handler = getRouteHandler("post", "/orders");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runOrderCheckout = async (orderId: string) => {
  const { req, res } = createMocks({
    method: "POST",
    url: `/orders/${orderId}/checkout`,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).params = { id: orderId };
  const handler = getRouteHandler("post", "/orders/:id/checkout");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runOrderVerify = async (orderId: string, body: Record<string, unknown>) => {
  const { req, res } = createMocks({
    method: "POST",
    url: `/orders/${orderId}/verify-payment`,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).params = { id: orderId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = body;
  const handler = getRouteHandler("post", "/orders/:id/verify-payment");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

describe("public routes", () => {
  beforeEach(() => {
    store.qrCodes.length = 0;
    store.qrRotations.length = 0;
    store.businesses.length = 0;
    store.tables.length = 0;
    store.categories.length = 0;
    store.menuItems.length = 0;
    store.orders.length = 0;
    store.orderItems.length = 0;
    razorpayCreateMock.mockReset();
  });

  it("returns qr context for valid token", async () => {
    store.qrCodes.push({
      uniqueCode: "valid-qr-token-123",
      business: { id: "b1", slug: "seed-qr-biz", name: "Seed", status: "approved" },
      table: { id: "t1", tableNumber: 2, isActive: true },
    });

    const res = await runQr("/qr/valid-qr-token-123", { qrToken: "valid-qr-token-123" });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe(1);
    expect(res._getJSONData().data.qr.business.slug).toBe("seed-qr-biz");
  });

  it("rejects missing token context", async () => {
    const res = await runQr("/qr/nope", { qrToken: "nope" });
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.code).toBe("INVALID_QR_TOKEN");
  });

  it("accepts rotated old token during grace window", async () => {
    const activeQr = {
      uniqueCode: "new-qr-token-123",
      business: { id: "b1", slug: "seed-qr-biz", name: "Seed", status: "approved" },
      table: { id: "t1", tableNumber: 2, isActive: true },
    };
    store.qrCodes.push(activeQr);
    store.qrRotations.push({
      oldToken: "old-qr-token-123",
      createdAt: new Date(),
      graceExpiresAt: new Date(Date.now() + 60_000),
      qrCode: activeQr,
    });

    const res = await runQr("/qr/old-qr-token-123", { qrToken: "old-qr-token-123" });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.qr.isGraceToken).toBe(true);
    expect(res._getJSONData().data.qr.business.slug).toBe("seed-qr-biz");
  });

  it("returns public menu for approved business", async () => {
    store.businesses.push({
      id: "b1",
      slug: "cafe-aurora",
      name: "Cafe Aurora",
      currencyCode: "USD",
      status: "approved",
      archivedAt: null,
    });
    store.categories.push({
      id: "cat1",
      name: "Coffee",
      businessId: "b1",
      sortOrder: 0,
      menuItems: [
        {
          id: "i1",
          name: "Latte",
          description: "Steamed milk and espresso",
          price: { toString: () => "5.50" },
          dietaryTags: ["vegetarian"],
          imagePath: null,
          isAvailable: true,
          sortOrder: 0,
        },
      ],
    });

    const res = await runMenu("/menu/cafe-aurora", { slug: "cafe-aurora" });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe(1);
    expect(res._getJSONData().data.business.name).toBe("Cafe Aurora");
    expect(res._getJSONData().data.categories[0].items[0].name).toBe("Latte");
    expect(res._getJSONData().data.categories[0].items[0].price).toBe("5.50");
  });

  it("rejects inactive table context", async () => {
    store.businesses.push({
      id: "b1",
      slug: "cafe-aurora",
      name: "Cafe Aurora",
      currencyCode: "USD",
      status: "approved",
      archivedAt: null,
    });
    store.tables.push({ id: "t1", businessId: "b1", tableNumber: 3, isActive: false });

    const res = await runMenu("/menu/cafe-aurora?table=3", { slug: "cafe-aurora" }, { table: "3" });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.code).toBe("TABLE_INACTIVE");
  });

  it("creates orders using server-side prices", async () => {
    store.businesses.push({
      id: "b1",
      slug: "cafe-aurora",
      name: "Cafe Aurora",
      currencyCode: "USD",
      status: "approved",
      archivedAt: null,
      blocked: false,
    });
    store.tables.push({ id: "t1", businessId: "b1", tableNumber: 1, isActive: true });
    store.menuItems.push({
      id: "m1",
      businessId: "b1",
      isAvailable: true,
      price: new Prisma.Decimal("5.50"),
    });
    store.menuItems.push({
      id: "m2",
      businessId: "b1",
      isAvailable: true,
      price: new Prisma.Decimal("3.25"),
    });

    const res = await runOrderCreate({
      businessId: "b1",
      tableId: "t1",
      customerName: "Asha",
      items: [
        { menuItemId: "m1", quantity: 2 },
        { menuItemId: "m2", quantity: 1 },
      ],
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.amount).toBe("14.25");
    expect(store.orderItems).toHaveLength(2);
  });

  it("creates a Razorpay order for checkout", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_123";
    store.businesses.push({
      id: "b1",
      slug: "cafe-aurora",
      name: "Cafe Aurora",
      currencyCode: "USD",
      status: "approved",
      archivedAt: null,
      blocked: false,
    });
    store.orders.push({
      id: "order-1",
      businessId: "b1",
      tableId: "t1",
      totalAmount: new Prisma.Decimal("12.50"),
      paymentStatus: "pending",
      status: "pending",
      customerName: "Asha",
      customerPhone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    razorpayCreateMock.mockResolvedValueOnce({ id: "order_rzp_1" });

    const res = await runOrderCheckout("order-1");
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData().data;
    expect(data.razorpayOrderId).toBe("order_rzp_1");
    expect(data.amount).toBe(1250);
    expect(data.currency).toBe("USD");
    expect(store.orders[0].razorpayOrderId).toBe("order_rzp_1");
  });

  it("verifies Razorpay payment signatures and confirms order", async () => {
    process.env.RAZORPAY_KEY_SECRET = "secret_test";
    store.orders.push({
      id: "order-2",
      businessId: "b1",
      tableId: "t1",
      totalAmount: new Prisma.Decimal("9.00"),
      paymentStatus: "pending",
      status: "pending",
      razorpayOrderId: "order_rzp_2",
      customerName: "Asha",
      customerPhone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const payload = "order_rzp_2|pay_123";
    const signature = createHmac("sha256", "secret_test").update(payload).digest("hex");

    const res = await runOrderVerify("order-2", {
      razorpay_order_id: "order_rzp_2",
      razorpay_payment_id: "pay_123",
      razorpay_signature: signature,
    });

    expect(res._getStatusCode()).toBe(200);
    expect(store.orders[0].paymentStatus).toBe("paid");
    expect(store.orders[0].status).toBe("confirmed");
    expect(store.orders[0].razorpayPaymentId).toBe("pay_123");
  });
});
