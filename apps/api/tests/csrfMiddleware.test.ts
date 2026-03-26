import { describe, it, expect, vi } from "vitest";
import { createMocks } from "node-mocks-http";
import { requireCsrf } from "../src/middleware/csrf";

const run = async (method: string, cookies?: Record<string, string>, headers?: Record<string, string>) => {
  const { req, res } = createMocks({
    method,
    headers: headers || {},
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).cookies = cookies || {};

  const next = vi.fn();
  requireCsrf(req, res, next);
  return { res, next };
};

describe("requireCsrf", () => {
  it("allows non-mutating requests without CSRF", async () => {
    const { res, next } = await run("GET");
    expect(res._getStatusCode()).toBe(200);
    expect(next).toHaveBeenCalled();
  });

  it("blocks mutating requests without token", async () => {
    const { res, next } = await run("POST");
    expect(next).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(403);
  });

  it("allows mutating requests with matching header and cookie", async () => {
    const { res, next } = await run(
      "POST",
      { csrf_token: "abc" },
      { "x-csrf-token": "abc" }
    );
    expect(res._getStatusCode()).toBe(200);
    expect(next).toHaveBeenCalled();
  });

  it("bypasses CSRF when Authorization header is present", async () => {
    const { res, next } = await run("POST", {}, { authorization: "Bearer token" });
    expect(res._getStatusCode()).toBe(200);
    expect(next).toHaveBeenCalled();
  });
});
