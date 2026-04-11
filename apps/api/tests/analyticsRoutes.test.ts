import { EventEmitter } from "events";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsWindowResult } from "@scan2serve/shared";

const fetchPostgresDashboardWindowMock = vi.fn();
const fetchWarehouseDashboardWindowMock = vi.fn();
const fetchPostgresOrdersWindowMock = vi.fn();
const fetchWarehouseOrdersWindowMock = vi.fn();

vi.mock("../src/services/analytics", async () => {
  const actual = await vi.importActual<typeof import("../src/services/analytics")>(
    "../src/services/analytics"
  );
  return {
    ...actual,
    fetchPostgresDashboardWindow: (...args: unknown[]) =>
      fetchPostgresDashboardWindowMock(...args),
    fetchWarehouseDashboardWindow: (...args: unknown[]) =>
      fetchWarehouseDashboardWindowMock(...args),
    fetchPostgresOrdersWindow: (...args: unknown[]) => fetchPostgresOrdersWindowMock(...args),
    fetchWarehouseOrdersWindow: (...args: unknown[]) => fetchWarehouseOrdersWindowMock(...args),
  };
});

const getAnalyticsCacheMock = vi.fn(async () => null);
const setAnalyticsCacheMock = vi.fn(async () => undefined);
vi.mock("../src/services/analyticsCache", () => ({
  buildAnalyticsCacheKey: (parts: string[]) => parts.join(":"),
  getAnalyticsCache: (...args: unknown[]) => getAnalyticsCacheMock(...args),
  setAnalyticsCache: (...args: unknown[]) => setAnalyticsCacheMock(...args),
}));

vi.mock("../src/prisma", () => ({
  prisma: {
    business: {
      findFirst: vi.fn(async () => ({ timezone: "Asia/Kolkata" })),
    },
  },
}));

import analyticsRouter from "../src/routes/analytics";

type SupportedMethod = "post";

const getRouteHandler = (method: SupportedMethod, path: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (analyticsRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  const handlers = layer.route.stack.map((stackEntry: { handle: unknown }) => stackEntry.handle);
  return handlers[handlers.length - 1] as (
    req: ReturnType<typeof createMocks>["req"],
    res: ReturnType<typeof createMocks>["res"],
    next: (err?: unknown) => void
  ) => void;
};

const waitForResponseEnd = async (res: ReturnType<typeof createMocks>["res"]) => {
  const maxTicks = 100;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (res.writableEnded || res._isEndCalled()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Mock response did not complete");
};

const runAnalytics = async (path: string, body: Record<string, unknown>, role = "owner") => {
  const { req, res } = createMocks({
    method: "POST",
    url: path,
    body,
    eventEmitter: EventEmitter,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).business = { id: "biz_1" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).businessRole = role;

  const handler = getRouteHandler("post", path);
  handler(req, res, (err?: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

describe("analytics routes", () => {
  beforeEach(() => {
    fetchPostgresDashboardWindowMock.mockReset();
    fetchWarehouseDashboardWindowMock.mockReset();
    fetchPostgresOrdersWindowMock.mockReset();
    fetchWarehouseOrdersWindowMock.mockReset();
    getAnalyticsCacheMock.mockReset();
    setAnalyticsCacheMock.mockReset();
  });

  it("dispatches dashboard analytics to Postgres source", async () => {
    const result: AnalyticsWindowResult = {
      window: "today",
      source: "postgres",
      status: "ok",
      summary: {
        totalOrders: 2,
        paidRevenue: "40",
        avgPaidOrderValue: "20",
      },
    };
    fetchPostgresDashboardWindowMock.mockResolvedValue(result);

    const res = await runAnalytics("/dashboard", {
      source: "postgres",
      windows: ["today"],
      granularity: "summary",
    });

    expect(fetchPostgresDashboardWindowMock).toHaveBeenCalledWith(
      "biz_1",
      "Asia/Kolkata",
      "today",
      "summary"
    );
    expect(fetchWarehouseDashboardWindowMock).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.windows.today.summary.totalOrders).toBe(2);
  });

  it("dispatches orders analytics to warehouse source", async () => {
    const result: AnalyticsWindowResult = {
      window: "lastWeek",
      source: "warehouse",
      status: "ok",
      detail: {
        statusSeries: {},
        statusLatencyMinutes: {},
        peakHours: [],
        paymentMethodMix: [],
        failedPaymentCount: 0,
        refundedCount: 0,
      },
    };
    fetchWarehouseOrdersWindowMock.mockResolvedValue(result);

    const res = await runAnalytics("/orders", {
      source: "warehouse",
      windows: ["lastWeek"],
      granularity: "detail",
    });

    expect(fetchWarehouseOrdersWindowMock).toHaveBeenCalledWith(
      "biz_1",
      "Asia/Kolkata",
      "lastWeek",
      "detail"
    );
    expect(fetchPostgresOrdersWindowMock).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.windows.lastWeek.source).toBe("warehouse");
  });
});
