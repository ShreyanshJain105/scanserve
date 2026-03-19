import { EventEmitter } from "events";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import publicRouter from "../src/routes/public";

const qrCodes: any[] = [];

vi.mock("../src/prisma", () => ({
  prisma: {
    qrCode: {
      findUnique: vi.fn(async ({ where: { uniqueCode } }) =>
        qrCodes.find((q) => q.uniqueCode === uniqueCode) || null
      ),
    },
  },
}));

type SupportedMethod = "get";

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

const run = async (path: string, params?: Record<string, string>) => {
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

describe("public routes", () => {
  beforeEach(() => {
    qrCodes.length = 0;
  });

  it("returns qr context for valid token", async () => {
    qrCodes.push({
      uniqueCode: "valid-qr-token-123",
      business: { id: "b1", slug: "seed-qr-biz", name: "Seed", status: "approved" },
      table: { id: "t1", tableNumber: 2, isActive: true },
    });

    const res = await run("/qr/valid-qr-token-123", { qrToken: "valid-qr-token-123" });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe(1);
    expect(res._getJSONData().data.qr.business.slug).toBe("seed-qr-biz");
  });

  it("rejects missing token context", async () => {
    const res = await run("/qr/nope", { qrToken: "nope" });
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.code).toBe("INVALID_QR_TOKEN");
  });
});
