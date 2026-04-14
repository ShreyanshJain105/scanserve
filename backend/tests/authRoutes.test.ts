import { EventEmitter } from "events";
import { createMocks } from "node-mocks-http";
import { describe, it, expect, beforeEach, vi } from "vitest";
import authRouter from "../src/routes/auth";
import { __resetQrAuthRateLimitForTests } from "../src/middleware/qrAuthRateLimit";
import { signAccessToken } from "../src/services/authService";

const users: any[] = [];
const customerUsers: any[] = [];
const refreshTokens: any[] = [];
const customerRefreshTokens: any[] = [];
const qrCodes: any[] = [
  {
    id: "qr1",
    uniqueCode: "valid-qr-token-123",
    businessId: "b1",
    tableId: "t1",
    createdAt: new Date(),
    business: { id: "b1", status: "approved" },
    table: { id: "t1", isActive: true },
  },
];

vi.mock("../src/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where: { email, id } }) => {
        if (email) return users.find((u) => u.email === email) || null;
        if (id) return users.find((u) => u.id === id) || null;
        return null;
      }),
      create: vi.fn(async ({ data }) => {
        const user = { id: `${users.length + 1}`, ...data };
        users.push(user);
        return user;
      }),
    },
    customerUser: {
      findUnique: vi.fn(async ({ where: { id } }) => {
        if (id) return customerUsers.find((u) => u.id === id) || null;
        return null;
      }),
      findFirst: vi.fn(async ({ where }) => {
        const matches = customerUsers.filter((u) =>
          where?.OR?.some((cond: any) => {
            if (cond.email) return u.email === cond.email;
            if (cond.phone) return u.phone === cond.phone;
            return false;
          })
        );
        return matches[0] || null;
      }),
      create: vi.fn(async ({ data }) => {
        const user = { id: `c-${customerUsers.length + 1}`, ...data };
        customerUsers.push(user);
        return user;
      }),
    },
    qrCode: {
      findUnique: vi.fn(async ({ where: { uniqueCode } }) =>
        qrCodes.find((q) => q.uniqueCode === uniqueCode) || null
      ),
    },
    refreshToken: {
      create: vi.fn(async ({ data }) => {
        const rec = { id: `${refreshTokens.length + 1}`, ...data };
        refreshTokens.push(rec);
        return rec;
      }),
      findUnique: vi.fn(async ({ where: { tokenHash } }) =>
        refreshTokens.find((t) => t.tokenHash === tokenHash) || null
      ),
      update: vi.fn(async ({ where: { id }, data }) => {
        const idx = refreshTokens.findIndex((t) => t.id === id);
        if (idx >= 0) refreshTokens[idx] = { ...refreshTokens[idx], ...data };
        return refreshTokens[idx];
      }),
      updateMany: vi.fn(async ({ where: { tokenHash }, data }) => {
        refreshTokens.forEach((t, i) => {
          if (t.tokenHash === tokenHash) {
            refreshTokens[i] = { ...t, ...data };
          }
        });
      }),
    },
    customerRefreshToken: {
      create: vi.fn(async ({ data }) => {
        const rec = { id: `cr-${customerRefreshTokens.length + 1}`, ...data };
        customerRefreshTokens.push(rec);
        return rec;
      }),
      findUnique: vi.fn(async ({ where: { tokenHash } }) =>
        customerRefreshTokens.find((t) => t.tokenHash === tokenHash) || null
      ),
      update: vi.fn(async ({ where: { id }, data }) => {
        const idx = customerRefreshTokens.findIndex((t) => t.id === id);
        if (idx >= 0) customerRefreshTokens[idx] = { ...customerRefreshTokens[idx], ...data };
        return customerRefreshTokens[idx];
      }),
      updateMany: vi.fn(async ({ where: { tokenHash }, data }) => {
        customerRefreshTokens.forEach((t, i) => {
          if (t.tokenHash === tokenHash) {
            customerRefreshTokens[i] = { ...t, ...data };
          }
        });
      }),
    },
  },
}));

vi.stubEnv("JWT_SECRET", "test-secret");
vi.stubEnv("ACCESS_TOKEN_TTL_MINUTES", "15");
vi.stubEnv("REFRESH_TOKEN_TTL_DAYS", "7");
vi.stubEnv("NODE_ENV", "test");

const parseCookies = (cookieHeader?: string) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, v] = part.trim().split("=");
    if (k) acc[k] = decodeURIComponent(v || "");
    return acc;
  }, {} as Record<string, string>);
};

type SupportedMethod = "post" | "get";

const getRouteHandler = (method: SupportedMethod, path: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (authRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
};

const waitForResponseEnd = async (res: ReturnType<typeof createMocks>["res"]) => {
  const maxTicks = 200;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    // node-mocks-http tracks "ended" with either writableEnded or _isEndCalled.
    if (res.writableEnded || res._isEndCalled()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Mock response did not complete");
};

const run = async (
  method: SupportedMethod,
  path: string,
  body?: any,
  cookies?: string,
  headers?: Record<string, string>
) => {
  const { req, res } = createMocks({
    method: method.toUpperCase(),
    url: path,
    headers: {
      ...(cookies ? { cookie: cookies } : {}),
      ...(headers || {}),
    },
    eventEmitter: EventEmitter,
  });

  // Bypass parser middleware for isolated router tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = parseCookies(cookies);

  const handler = getRouteHandler(method, path);
  handler(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);

  return res;
};

describe("auth routes", () => {
  beforeEach(() => {
    users.length = 0;
    customerUsers.length = 0;
    refreshTokens.length = 0;
    customerRefreshTokens.length = 0;
    qrCodes.splice(
      0,
      qrCodes.length,
      {
        id: "qr1",
        uniqueCode: "valid-qr-token-123",
        businessId: "b1",
        tableId: "t1",
        createdAt: new Date(),
        business: { id: "b1", status: "approved" },
        table: { id: "t1", isActive: true },
      }
    );
    __resetQrAuthRateLimitForTests();
    vi.stubEnv("QR_AUTH_RATE_LIMIT_WINDOW_SEC", "60");
    vi.stubEnv("QR_AUTH_RATE_LIMIT_MAX_ATTEMPTS", "10");
    vi.stubEnv("QR_TOKEN_MAX_AGE_DAYS", "0");
  });

  it("registers and logs in a user, issues cookies", async () => {
    const registerRes = await run("post", "/register", {
      email: "a@b.com",
      password: "password123",
      role: "business",
    });
    expect(registerRes._getStatusCode()).toBe(201);
    expect(registerRes._getJSONData().status).toBe(1);

    const loginRes = await run("post", "/login", {
      email: "a@b.com",
      password: "password123",
    });
    expect(loginRes._getStatusCode()).toBe(200);
    expect(loginRes._getJSONData().status).toBe(1);
    expect(refreshTokens).toHaveLength(1);
  });

  it("rejects invalid credentials", async () => {
    await run("post", "/register", {
      email: "x@y.com",
      password: "password123",
      role: "business",
    });

    const res = await run("post", "/login", {
      email: "x@y.com",
      password: "wrongpass",
    });
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().status).toBe(0);
  });

  it("rejects customer registration outside QR context", async () => {
    const res = await run("post", "/register", {
      email: "c@y.com",
      password: "password123",
      role: "customer",
    });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error?.code).toBe("CUSTOMER_AUTH_QR_ONLY");
  });

  it("rejects customer login outside QR context", async () => {
    await run("post", "/register", {
      email: "qr-user@y.com",
      password: "password123",
      role: "customer",
      qrToken: "valid-qr-token-123",
    });

    const res = await run("post", "/login", {
      email: "qr-user@y.com",
      password: "password123",
    });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error?.code).toBe("CUSTOMER_AUTH_QR_ONLY");
  });

  it("treats invalid qrToken customer registration attempts as non-QR and rejects them", async () => {
    vi.stubEnv("QR_AUTH_RATE_LIMIT_WINDOW_SEC", "120");
    vi.stubEnv("QR_AUTH_RATE_LIMIT_MAX_ATTEMPTS", "2");

    const first = await run("post", "/register", {
      email: "rl-user@y.com",
      password: "password123",
      role: "customer",
      qrToken: "bad-qr-token-123",
    });
    expect(first._getStatusCode()).toBe(403);
    expect(first._getJSONData().error?.code).toBe("CUSTOMER_AUTH_QR_ONLY");

    const second = await run("post", "/register", {
      email: "rl-user@y.com",
      password: "password123",
      role: "customer",
      qrToken: "bad-qr-token-123",
    });
    expect(second._getStatusCode()).toBe(403);
    expect(second._getJSONData().error?.code).toBe("CUSTOMER_AUTH_QR_ONLY");
  });

  it("treats inactive QR context as non-customer scope for registration", async () => {
    qrCodes[0].table.isActive = false;
    const res = await run("post", "/register", {
      email: "inactive-table@y.com",
      password: "password123",
      role: "customer",
      qrToken: "valid-qr-token-123",
    });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error?.code).toBe("CUSTOMER_AUTH_QR_ONLY");
  });

  it("uses business scope for refresh when both cookie sets are sent without qrToken", async () => {
    const res = await run(
      "post",
      "/refresh",
      undefined,
      "refresh_token=business-token; qr_customer_refresh=customer-token"
    );
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().error?.code).toBe("INVALID_REFRESH");
  });

  it("returns both valid sessions from /sessions", async () => {
    users.push(
      { id: "b-user", email: "biz@x.com", role: "business", passwordHash: "x" }
    );
    customerUsers.push({
      id: "c-user",
      email: "cust@x.com",
      phone: null,
      passwordHash: "x",
    });

    const businessAccess = signAccessToken({
      id: "b-user",
      email: "biz@x.com",
      role: "business",
    });
    const customerAccess = signAccessToken({
      id: "c-user",
      email: "cust@x.com",
      role: "customer",
    });

    const res = await run(
      "get",
      "/sessions",
      undefined,
      `access_token=${encodeURIComponent(businessAccess)}; qr_customer_access=${encodeURIComponent(customerAccess)}`
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.businessUser?.id).toBe("b-user");
    expect(res._getJSONData().data.customerUser?.id).toBe("c-user");
  });

  it("supports scoped logout without clearing both sessions", async () => {
    const res = await run(
      "post",
      "/logout",
      { scope: "customer" },
      "refresh_token=business-refresh-token; qr_customer_refresh=customer-refresh-token"
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe(1);
  });
});
