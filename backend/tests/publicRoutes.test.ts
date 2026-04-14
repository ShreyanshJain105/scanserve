import { EventEmitter } from "events";
import { createHmac } from "crypto";
import { createMocks } from "node-mocks-http";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../src/services/authService";

const TestDecimal = vi.hoisted(
  () =>
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
);

vi.mock("@prisma/client", () => ({
  Prisma: {
    Decimal: TestDecimal,
  },
}));

vi.mock("../src/services/reviewWarehouse", () => ({
  fetchWarehouseReviewIdsByOrderIds: vi.fn(async () => new Map()),
  fetchWarehouseReviewSummary: vi.fn(async () => null),
  fetchWarehouseReviews: vi.fn(async () => []),
}));

import { Prisma } from "@prisma/client";

let publicRouter: any;

beforeAll(async () => {
  const module = await import("../src/routes/public");
  publicRouter = module.default;
});

const store = vi.hoisted(() => ({
  qrCodes: [] as any[],
  qrRotations: [] as any[],
  businesses: [] as any[],
  tables: [] as any[],
  categories: [] as any[],
  menuItems: [] as any[],
  orders: [] as any[],
  orderItems: [] as any[],
  reviews: [] as any[],
  reviewLikes: [] as any[],
  customerUsers: [] as any[],
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
  customerUser: {
    findUnique: vi.fn(async ({ where: { id } }) =>
      store.customerUsers.find((user) => user.id === id) || null
    ),
    findFirst: vi.fn(async ({ where }) => {
      const candidates = store.customerUsers.filter((user) => {
        if (where?.OR?.length) {
          return where.OR.some((condition: any) => {
            if (condition.email) return user.email === condition.email;
            if (condition.phone) return user.phone === condition.phone;
            return false;
          });
        }
        return false;
      });
      return candidates[0] || null;
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
    findFirst: vi.fn(async ({ where, include, select }) => {
      let order = store.orders.find((entry) => entry.id === where?.id);
      if (where?.customerUserId) {
        order = store.orders.find(
          (entry) => entry.id === where.id && entry.customerUserId === where.customerUserId
        );
      }
      if (!order) return null;
      if (select) {
        const selected: any = {};
        if (select.id) selected.id = order.id;
        if (select.updatedAt) selected.updatedAt = order.updatedAt;
        if (select.createdAt) selected.createdAt = order.createdAt;
        if (select.businessId) selected.businessId = order.businessId;
        if (select.status) selected.status = order.status;
        if (select.paymentStatus) selected.paymentStatus = order.paymentStatus;
        if (select.razorpayOrderId) selected.razorpayOrderId = order.razorpayOrderId;
        if (select.paymentMethod) selected.paymentMethod = order.paymentMethod;
        if (select.customerUserId) selected.customerUserId = order.customerUserId;
        return selected;
      }
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
    findMany: vi.fn(async ({ where, orderBy, take, include }) => {
      let results = store.orders.filter((entry) => {
        if (where?.customerUserId && entry.customerUserId !== where.customerUserId) {
          return false;
        }
        if (where?.OR?.length) {
          return where.OR.some((condition: any) => {
            if (condition.updatedAt?.lt) {
              return entry.updatedAt < condition.updatedAt.lt;
            }
            if (condition.updatedAt && condition.id?.lt) {
              const target =
                condition.updatedAt instanceof Date
                  ? condition.updatedAt.getTime()
                  : condition.updatedAt.equals?.getTime?.() ?? condition.updatedAt.equals;
              return entry.updatedAt.getTime() === target && entry.id < condition.id.lt;
            }
            if (condition.updatedAt?.equals && condition.id?.lt) {
              return (
                entry.updatedAt.getTime() === condition.updatedAt.equals.getTime?.() &&
                entry.id < condition.id.lt
              );
            }
            return false;
          });
        }
        return true;
      });

      if (orderBy?.length) {
        results = results.sort((a, b) => {
          for (const rule of orderBy) {
            if (rule.updatedAt) {
              const diff = b.updatedAt.getTime() - a.updatedAt.getTime();
              if (diff !== 0) return diff;
            }
            if (rule.id) {
              if (a.id === b.id) continue;
              return b.id.localeCompare(a.id);
            }
          }
          return 0;
        });
      }

      const limited = typeof take === "number" ? results.slice(0, take) : results;

      if (include?.business) {
        return limited.map((order) => ({
          ...order,
          business: store.businesses.find((b) => b.id === order.businessId) || null,
        }));
      }
      return limited;
    }),
    update: vi.fn(async ({ where, data }) => {
      const targetId = where?.id_createdAt?.id ?? where?.id;
      const order = store.orders.find((entry) => entry.id === targetId);
      if (!order) return null;
      Object.assign(order, data, { updatedAt: new Date() });
      return order;
    }),
  },
  review: {
    findMany: vi.fn(async ({ where, include, orderBy, take, skip }) => {
      let results = [...store.reviews];
      if (where?.orderId?.in) {
        results = results.filter((review) => where.orderId.in.includes(review.orderId));
      }
      if (where?.OR?.length) {
        results = results.filter((review) =>
          where.OR.some((condition: any) => {
            if (condition.businessId) return review.businessId === condition.businessId;
            if (condition.order?.businessId) {
              return review.businessId === condition.order.businessId;
            }
            return false;
          })
        );
      } else if (where?.businessId) {
        results = results.filter((review) => review.businessId === where.businessId);
      }
      if (where?.rating) {
        results = results.filter((review) => review.rating === where.rating);
      }
      if (where?.createdAt?.gte) {
        results = results.filter((review) => review.createdAt >= where.createdAt.gte);
      }
      if (orderBy?.length) {
        results.sort((a, b) => {
          for (const rule of orderBy) {
            if (rule.likes?._count) {
              const aLikes = store.reviewLikes.filter((like) => like.reviewId === a.id).length;
              const bLikes = store.reviewLikes.filter((like) => like.reviewId === b.id).length;
              if (aLikes !== bLikes) return bLikes - aLikes;
            }
            if (rule.createdAt) {
              const diff = b.createdAt.getTime() - a.createdAt.getTime();
              if (diff !== 0) return diff;
            }
          }
          return 0;
        });
      }
      const offset = typeof skip === "number" ? skip : 0;
      const limited =
        typeof take === "number" ? results.slice(offset, offset + take) : results;
      if (include?._count?.select?.likes) {
        return limited.map((review) => ({
          ...review,
          _count: {
            likes: store.reviewLikes.filter((like) => like.reviewId === review.id).length,
          },
        }));
      }
      return limited;
    }),
    findFirst: vi.fn(async ({ where, select }) => {
      const match = store.reviews.find((review) => {
        if (where?.orderId && review.orderId !== where.orderId) return false;
        if (where?.orderCreatedAt && review.orderCreatedAt !== where.orderCreatedAt) return false;
        if (where?.id && review.id !== where.id) return false;
        return true;
      });
      if (!match) return null;
      if (select?.id) return { id: match.id };
      return match;
    }),
    findUnique: vi.fn(async ({ where, select }) => {
      const match = store.reviews.find((review) => review.id === where.id) || null;
      if (!match) return null;
      if (select) {
        const selected: any = {};
        if (select.id) selected.id = match.id;
        if (select.businessId) selected.businessId = match.businessId;
        return selected;
      }
      return match;
    }),
    aggregate: vi.fn(async ({ where }) => {
      let results = [...store.reviews];
      if (where?.OR?.length) {
        results = results.filter((review) =>
          where.OR.some((condition: any) => {
            if (condition.businessId) return review.businessId === condition.businessId;
            if (condition.order?.businessId) {
              return review.businessId === condition.order.businessId;
            }
            return false;
          })
        );
      } else if (where?.businessId) {
        results = results.filter((review) => review.businessId === where.businessId);
      }
      if (where?.rating) {
        results = results.filter((review) => review.rating === where.rating);
      }
      if (where?.createdAt?.gte) {
        results = results.filter((review) => review.createdAt >= where.createdAt.gte);
      }
      const total = results.length;
      const avg =
        total === 0
          ? null
          : results.reduce((sum, review) => sum + review.rating, 0) / total;
      return { _count: { _all: total }, _avg: { rating: avg } };
    }),
    groupBy: vi.fn(async ({ where }) => {
      let results = [...store.reviews];
      if (where?.OR?.length) {
        results = results.filter((review) =>
          where.OR.some((condition: any) => {
            if (condition.businessId) return review.businessId === condition.businessId;
            if (condition.order?.businessId) {
              return review.businessId === condition.order.businessId;
            }
            return false;
          })
        );
      } else if (where?.businessId) {
        results = results.filter((review) => review.businessId === where.businessId);
      }
      if (where?.rating) {
        results = results.filter((review) => review.rating === where.rating);
      }
      if (where?.createdAt?.gte) {
        results = results.filter((review) => review.createdAt >= where.createdAt.gte);
      }
      const counts = results.reduce((acc: Record<number, number>, review) => {
        acc[review.rating] = (acc[review.rating] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).map(([rating, count]) => ({
        rating: Number(rating),
        _count: { _all: count },
      }));
    }),
    create: vi.fn(async ({ data }) => {
      const record = {
        id: `review-${store.reviews.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      store.reviews.push(record);
      return record;
    }),
    deleteMany: vi.fn(async ({ where }) => {
      const ids = new Set(where.id?.in ?? []);
      store.reviews = store.reviews.filter((review) => !ids.has(review.id));
      store.reviewLikes = store.reviewLikes.filter((like) => !ids.has(like.reviewId));
      return { count: ids.size };
    }),
  },
  reviewLike: {
    findUnique: vi.fn(async ({ where }) => {
      const key = where.reviewId_customerUserId;
      return (
        store.reviewLikes.find(
          (like) =>
            like.reviewId === key.reviewId && like.customerUserId === key.customerUserId
        ) || null
      );
    }),
    findMany: vi.fn(async ({ where }) => {
      let results = [...store.reviewLikes];
      if (where?.customerUserId) {
        results = results.filter((like) => like.customerUserId === where.customerUserId);
      }
      if (where?.reviewId?.in) {
        results = results.filter((like) => where.reviewId.in.includes(like.reviewId));
      }
      return results;
    }),
    create: vi.fn(async ({ data }) => {
      const record = {
        id: `review-like-${store.reviewLikes.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      store.reviewLikes.push(record);
      return record;
    }),
    delete: vi.fn(async ({ where }) => {
      const index = store.reviewLikes.findIndex((like) => like.id === where.id);
      if (index === -1) return null;
      const [removed] = store.reviewLikes.splice(index, 1);
      return removed;
    }),
    count: vi.fn(async ({ where }) => {
      return store.reviewLikes.filter((like) => like.reviewId === where.reviewId).length;
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
  $transaction: vi.fn(async (input: any) => {
    if (Array.isArray(input)) {
      return Promise.all(input);
    }
    return input(prismaMock);
  }),
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
  isRazorpayConfigured: () =>
    Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
}));

const parseCookies = (cookieHeader?: string) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, v] = part.trim().split("=");
    if (k) acc[k] = decodeURIComponent(v || "");
    return acc;
  }, {} as Record<string, string>);
};

const customerCookie = (id: string, email: string) => {
  const token = signAccessToken({ id, email, role: "customer" });
  return `qr_customer_access=${encodeURIComponent(token)}`;
};

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

const runOrderCreate = async (body: Record<string, unknown>, cookies?: string) => {
  const { req, res } = createMocks({
    method: "POST",
    url: "/orders",
    headers: cookies ? { cookie: cookies } : undefined,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = parseCookies(cookies);
  const handler = getRouteHandler("post", "/orders");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runOrderList = async (query?: Record<string, string>, cookies?: string) => {
  const { req, res } = createMocks({
    method: "GET",
    url: "/orders",
    headers: cookies ? { cookie: cookies } : undefined,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).query = query ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = parseCookies(cookies);
  const handler = getRouteHandler("get", "/orders");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runOrderCheckout = async (orderId: string, cookies?: string) => {
  const { req, res } = createMocks({
    method: "POST",
    url: `/orders/${orderId}/checkout`,
    headers: cookies ? { cookie: cookies } : undefined,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).params = { id: orderId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = parseCookies(cookies);
  const handler = getRouteHandler("post", "/orders/:id/checkout");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runOrderVerify = async (
  orderId: string,
  body: Record<string, unknown>,
  cookies?: string
) => {
  const { req, res } = createMocks({
    method: "POST",
    url: `/orders/${orderId}/verify-payment`,
    headers: cookies ? { cookie: cookies } : undefined,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).params = { id: orderId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = parseCookies(cookies);
  const handler = getRouteHandler("post", "/orders/:id/verify-payment");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runReviewCreate = async (body: Record<string, unknown>, cookies?: string) => {
  const { req, res } = createMocks({
    method: "POST",
    url: "/reviews",
    headers: cookies ? { cookie: cookies } : undefined,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = parseCookies(cookies);
  const handler = getRouteHandler("post", "/reviews");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runReviewList = async (query: Record<string, string>) => {
  const { req, res } = createMocks({
    method: "GET",
    url: "/reviews",
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).query = query;
  const handler = getRouteHandler("get", "/reviews");
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

const runReviewLike = async (reviewId: string, cookies?: string) => {
  const { req, res } = createMocks({
    method: "POST",
    url: `/reviews/${reviewId}/like`,
    headers: cookies ? { cookie: cookies } : undefined,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).params = { id: reviewId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = parseCookies(cookies);
  const handler = getRouteHandler("post", "/reviews/:id/like");
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
    store.reviews.length = 0;
    store.reviewLikes.length = 0;
    store.customerUsers.length = 0;
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
    process.env.RAZORPAY_KEY_ID = "rzp_test_123";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    store.customerUsers.push({
      id: "cust_1",
      email: "cust@example.com",
      phone: null,
      passwordHash: "x",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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

    const res = await runOrderCreate(
      {
        businessId: "b1",
        tableId: "t1",
        customerName: "Asha",
        paymentMethod: "razorpay",
        items: [
          { menuItemId: "m1", quantity: 2 },
          { menuItemId: "m2", quantity: 1 },
        ],
      },
      customerCookie("cust_1", "cust@example.com")
    );

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.amount).toBe("14.25");
    expect(store.orderItems).toHaveLength(2);
  });

  it("lists customer orders newest-first with pagination", async () => {
    store.businesses.push(
      { id: "b1", slug: "alpha", name: "Alpha", currencyCode: "USD" },
      { id: "b2", slug: "bravo", name: "Bravo", currencyCode: "INR" }
    );
    store.customerUsers.push({ id: "cust-1", email: "cust@example.com" });
    store.orders.push(
      {
        id: "order-1",
        businessId: "b1",
        tableId: "t1",
        status: "confirmed",
        totalAmount: new Prisma.Decimal("10.00"),
        paymentStatus: "paid",
        paymentMethod: "cash",
        customerUserId: "cust-1",
        createdAt: new Date("2026-03-29T10:00:00Z"),
        updatedAt: new Date("2026-03-29T10:00:00Z"),
      },
      {
        id: "order-2",
        businessId: "b2",
        tableId: "t2",
        status: "pending",
        totalAmount: new Prisma.Decimal("20.00"),
        paymentStatus: "pending",
        paymentMethod: "razorpay",
        customerUserId: "cust-1",
        createdAt: new Date("2026-03-30T10:00:00Z"),
        updatedAt: new Date("2026-03-30T10:00:00Z"),
      },
      {
        id: "order-3",
        businessId: "b1",
        tableId: "t3",
        status: "completed",
        totalAmount: new Prisma.Decimal("30.00"),
        paymentStatus: "paid",
        paymentMethod: "cash",
        customerUserId: "cust-2",
        createdAt: new Date("2026-03-30T12:00:00Z"),
        updatedAt: new Date("2026-03-30T12:00:00Z"),
      }
    );

    const res = await runOrderList({ limit: "1" }, customerCookie("cust-1", "cust@example.com"));
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe(1);
    expect(res._getJSONData().data.orders).toHaveLength(1);
    expect(res._getJSONData().data.orders[0].id).toBe("order-2");
    expect(res._getJSONData().data.orders[0].business.name).toBe("Bravo");
    expect(res._getJSONData().data.nextCursor).toBe("order-2");

    const resPage2 = await runOrderList(
      { limit: "2", cursor: res._getJSONData().data.nextCursor },
      customerCookie("cust-1", "cust@example.com")
    );
    expect(resPage2._getJSONData().data.orders).toHaveLength(1);
    expect(resPage2._getJSONData().data.orders[0].id).toBe("order-1");
    expect(resPage2._getJSONData().data.nextCursor).toBeNull();
  });

  it("creates cash orders even without Razorpay config", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    store.customerUsers.push({
      id: "cust_1",
      email: "cust@example.com",
      phone: null,
      passwordHash: "x",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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

    const res = await runOrderCreate(
      {
        businessId: "b1",
        tableId: "t1",
        customerName: "Asha",
        paymentMethod: "cash",
        items: [{ menuItemId: "m1", quantity: 1 }],
      },
      customerCookie("cust_1", "cust@example.com")
    );

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.paymentStatus).toBe("unpaid");
    expect(store.orders[0].paymentMethod).toBe("cash");
  });

  it("blocks Razorpay orders when Razorpay is not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    store.customerUsers.push({
      id: "cust_1",
      email: "cust@example.com",
      phone: null,
      passwordHash: "x",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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

    const res = await runOrderCreate(
      {
        businessId: "b1",
        tableId: "t1",
        customerName: "Asha",
        paymentMethod: "razorpay",
        items: [{ menuItemId: "m1", quantity: 1 }],
      },
      customerCookie("cust_1", "cust@example.com")
    );

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error.code).toBe("RAZORPAY_NOT_CONFIGURED");
  });

  it("creates a Razorpay order for checkout", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_123";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    store.customerUsers.push({
      id: "cust_1",
      email: "cust@example.com",
      phone: null,
      passwordHash: "x",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
      paymentMethod: "razorpay",
      status: "pending",
      customerName: "Asha",
      customerPhone: null,
      customerUserId: "cust_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    razorpayCreateMock.mockResolvedValueOnce({ id: "order_rzp_1" });

    const res = await runOrderCheckout("order-1", customerCookie("cust_1", "cust@example.com"));
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData().data;
    expect(data.razorpayOrderId).toBe("order_rzp_1");
    expect(data.amount).toBe(1250);
    expect(data.currency).toBe("USD");
    expect(store.orders[0].razorpayOrderId).toBe("order_rzp_1");
  });

  it("verifies Razorpay payment signatures and confirms order", async () => {
    process.env.RAZORPAY_KEY_SECRET = "secret_test";
    store.customerUsers.push({
      id: "cust_1",
      email: "cust@example.com",
      phone: null,
      passwordHash: "x",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.orders.push({
      id: "order-2",
      businessId: "b1",
      tableId: "t1",
      totalAmount: new Prisma.Decimal("9.00"),
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      status: "pending",
      razorpayOrderId: "order_rzp_2",
      customerName: "Asha",
      customerPhone: null,
      customerUserId: "cust_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const payload = "order_rzp_2|pay_123";
    const signature = createHmac("sha256", "secret_test").update(payload).digest("hex");

    const res = await runOrderVerify(
      "order-2",
      {
        razorpay_order_id: "order_rzp_2",
        razorpay_payment_id: "pay_123",
        razorpay_signature: signature,
      },
      customerCookie("cust_1", "cust@example.com")
    );

    expect(res._getStatusCode()).toBe(200);
    expect(store.orders[0].paymentStatus).toBe("paid");
    expect(store.orders[0].status).toBe("confirmed");
    expect(store.orders[0].razorpayPaymentId).toBe("pay_123");
  });

  it("creates a review for completed orders only", async () => {
    store.customerUsers.push({
      id: "cust-1",
      email: "cust@example.com",
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.orders.push({
      id: "order-review",
      businessId: "b1",
      tableId: "t1",
      customerUserId: "cust-1",
      status: "completed",
      totalAmount: new Prisma.Decimal("12.00"),
      paymentStatus: "paid",
      paymentMethod: "razorpay",
      customerName: "Asha",
      customerPhone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await runReviewCreate(
      { orderId: "order-review", rating: 5, comment: "Great!" },
      customerCookie("cust-1", "cust@example.com")
    );

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.review.rating).toBe(5);

    const resDuplicate = await runReviewCreate(
      { orderId: "order-review", rating: 4 },
      customerCookie("cust-1", "cust@example.com")
    );
    expect(resDuplicate._getStatusCode()).toBe(409);
    expect(resDuplicate._getJSONData().error.code).toBe("REVIEW_ALREADY_EXISTS");
  });

  it("rejects reviews for incomplete orders", async () => {
    store.customerUsers.push({
      id: "cust-2",
      email: "cust2@example.com",
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.orders.push({
      id: "order-pending",
      businessId: "b1",
      tableId: "t1",
      customerUserId: "cust-2",
      status: "pending",
      totalAmount: new Prisma.Decimal("12.00"),
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      customerName: "Asha",
      customerPhone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await runReviewCreate(
      { orderId: "order-pending", rating: 4 },
      customerCookie("cust-2", "cust2@example.com")
    );
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error.code).toBe("ORDER_NOT_COMPLETED");
  });

  it("toggles review likes", async () => {
    store.customerUsers.push({
      id: "cust-3",
      email: "cust3@example.com",
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.reviews.push({
      id: "review-1",
      orderId: "order-like",
      orderCreatedAt: new Date(),
      businessId: "b1",
      customerUserId: "cust-3",
      rating: 4,
      comment: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const likeRes = await runReviewLike(
      "review-1",
      customerCookie("cust-3", "cust3@example.com")
    );
    expect(likeRes._getStatusCode()).toBe(200);
    expect(likeRes._getJSONData().data.liked).toBe(true);
    expect(likeRes._getJSONData().data.likesCount).toBe(1);

    const unlikeRes = await runReviewLike(
      "review-1",
      customerCookie("cust-3", "cust3@example.com")
    );
    expect(unlikeRes._getJSONData().data.liked).toBe(false);
    expect(unlikeRes._getJSONData().data.likesCount).toBe(0);
  });

  it("returns review list summary and paginated items", async () => {
    store.businesses.push({
      id: "b1",
      slug: "cafe-aurora",
      name: "Cafe Aurora",
      currencyCode: "USD",
      status: "approved",
      archivedAt: null,
      blocked: false,
    });
    const now = new Date();
    store.reviews.push(
      {
        id: "review-2",
        orderId: "order-2",
        orderCreatedAt: now,
        businessId: "b1",
        customerUserId: "cust-1",
        rating: 5,
        comment: "Amazing",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "review-3",
        orderId: "order-3",
        orderCreatedAt: now,
        businessId: "b1",
        customerUserId: "cust-2",
        rating: 3,
        comment: null,
        createdAt: new Date(now.getTime() - 1000),
        updatedAt: now,
      }
    );
    store.reviewLikes.push({
      id: "like-1",
      reviewId: "review-3",
      customerUserId: "cust-4",
      createdAt: now,
    });

    const res = await runReviewList({ businessId: "b1", page: "1", limit: "10" });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.summary.totalReviews).toBe(2);
    expect(res._getJSONData().data.reviews.length).toBe(2);
    expect(res._getJSONData().data.reviews[0].id).toBe("review-2");
  });
});
