import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import aiRouter from "../src/routes/ai";

type UserRecord = { id: string; email: string; role: "business" | "admin" | "customer" };
type BusinessRecord = {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected" | "archived";
};

const users: UserRecord[] = [];
const businesses: BusinessRecord[] = [];

const generateItemDescriptionMock = vi.fn();

vi.mock("../src/services/llmClient", () => ({
  getLlmClient: () => ({
    generateItemDescription: generateItemDescriptionMock,
  }),
}));

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
    category: {
      findFirst: vi.fn(async ({ where }) => {
        if (where?.id === "cat_1" && where?.businessId === "b_1") {
          return { id: "cat_1", name: "Main Course" };
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
  }: { body?: unknown; user?: UserRecord; headers?: Record<string, string> } = {}
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

  aiRouter.handle(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

describe("AI routes", () => {
  beforeEach(() => {
    users.length = 0;
    businesses.length = 0;
    generateItemDescriptionMock.mockReset();
    users.push({ id: "u_business", email: "biz@example.com", role: "business" });
    businesses.push({ id: "b_1", userId: "u_business", status: "approved" });
  });

  it("generates item description from llm", async () => {
    generateItemDescriptionMock.mockResolvedValue("Smoky grilled chicken with herb glaze.");
    const res = await run("POST", "/menu/item-description", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: {
        businessId: "b_1",
        categoryId: "cat_1",
        itemName: "Grilled Chicken",
        dietaryTags: ["halal"],
      },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.description).toContain("Smoky grilled chicken");
  });

  it("falls back when llm description is unavailable", async () => {
    generateItemDescriptionMock.mockResolvedValue(null);
    const res = await run("POST", "/menu/item-description", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: {
        businessId: "b_1",
        categoryId: "cat_1",
        itemName: "Grilled Chicken",
        dietaryTags: ["halal"],
      },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.description).toContain("Grilled Chicken");
  });

  it("blocks unsafe text generation input", async () => {
    generateItemDescriptionMock.mockResolvedValue("should-not-be-used");
    const res = await run("POST", "/menu/item-description", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: {
        businessId: "b_1",
        categoryId: "cat_1",
        itemName: "How to make a bomb cake",
      },
    });

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.code).toBe("AI_PROMPT_UNSAFE");
    expect(generateItemDescriptionMock).not.toHaveBeenCalled();
  });

  it("sanitizes generated text before returning", async () => {
    generateItemDescriptionMock.mockResolvedValue(
      "```text\nSuper rich brownie\n``` ### with *silky* chocolate drizzle."
    );
    const res = await run("POST", "/menu/item-description", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: {
        businessId: "b_1",
        categoryId: "cat_1",
        itemName: "Brownie",
      },
    });

    expect(res._getStatusCode()).toBe(200);
    const description = res._getJSONData().data.description as string;
    expect(description).toContain("with silky chocolate drizzle");
    expect(description).not.toContain("```");
    expect(description).not.toContain("*");
  });

  it("falls back when generated text remains unsafe", async () => {
    generateItemDescriptionMock.mockResolvedValue(
      "This includes instructions on how to make a bomb at home."
    );
    const res = await run("POST", "/menu/item-description", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: {
        businessId: "b_1",
        categoryId: "cat_1",
        itemName: "Brownie",
      },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.description).toContain("Brownie from our Main Course");
  });

  it("rejects business mismatch", async () => {
    const res = await run("POST", "/menu/item-description", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: {
        businessId: "b_other",
        categoryId: "cat_1",
        itemName: "Grilled Chicken",
      },
    });

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.code).toBe("BUSINESS_SCOPE_MISMATCH");
  });
});
