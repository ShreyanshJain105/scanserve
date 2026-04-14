import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import businessRouter from "../src/routes/business";

type UserRecord = { id: string; email: string; role: "business" | "admin" | "customer" };
type BusinessRecord = {
  id: string;
  userId: string;
  slug: string;
  status: "pending" | "approved" | "rejected" | "archived";
  updatedAt: Date;
};
type TableRecord = {
  id: string;
  businessId: string;
  tableNumber: number;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
};
type QrCodeRecord = {
  id: string;
  businessId: string;
  tableId: string;
  uniqueCode: string;
  qrImageUrl: string | null;
  createdAt: Date;
};
type QrRotationRecord = {
  id: string;
  qrCodeId: string;
  oldToken: string;
  newToken: string;
  rotatedByUserId: string | null;
  reason: string | null;
  graceExpiresAt: Date | null;
  createdAt: Date;
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
const qrCodes: QrCodeRecord[] = [];
const qrRotations: QrRotationRecord[] = [];
const businessMemberships: BusinessMembershipRecord[] = [];

const nextTableId = () => `t_${tables.length + 1}`;
const nextQrId = () => `q_${qrCodes.length + 1}`;
const nextRotId = () => `r_${qrRotations.length + 1}`;
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
      findFirst: vi.fn(async ({ where, select }) => {
        const row =
          businesses.find(
            (b) =>
              (where?.id ? b.id === where.id : true) &&
              (where?.userId ? b.userId === where.userId : true)
          ) ?? null;
        if (!row) return null;
        if (select) {
          const out: Record<string, unknown> = {};
          Object.keys(select).forEach((key) => {
            if ((select as Record<string, unknown>)[key]) out[key] = (row as Record<string, unknown>)[key];
          });
          return out;
        }
        return row;
      }),
      findMany: vi.fn(async ({ where }) => {
        let list = [...businesses];
        if (where?.userId) list = list.filter((b) => b.userId === where.userId);
        return list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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
    table: {
      count: vi.fn(async ({ where }) => {
        let list = [...tables];
        if (where?.businessId) list = list.filter((t) => t.businessId === where.businessId);
        if (where?.isActive !== undefined) list = list.filter((t) => t.isActive === where.isActive);
        if (where?.id?.in) list = list.filter((t) => where.id.in.includes(t.id));
        return list.length;
      }),
      findMany: vi.fn(async ({ where, orderBy, skip = 0, take, include, select }) => {
        let list = [...tables];
        if (where?.businessId) list = list.filter((t) => t.businessId === where.businessId);
        if (where?.isActive !== undefined) list = list.filter((t) => t.isActive === where.isActive);
        if (where?.id?.in) list = list.filter((t) => where.id.in.includes(t.id));
        if (where?.tableNumber?.in) {
          list = list.filter((t) => where.tableNumber.in.includes(t.tableNumber));
        }
        if (orderBy?.tableNumber === "asc") {
          list.sort((a, b) => a.tableNumber - b.tableNumber);
        }
        if (typeof take === "number") list = list.slice(skip, skip + take);
        if (select?.tableNumber) {
          return list.map((row) => ({ tableNumber: row.tableNumber }));
        }
        if (include?.qrCode || include?.business) {
          return list.map((row) => ({
            ...row,
            qrCode: include?.qrCode
              ? qrCodes.find((qr) => qr.tableId === row.id) ?? null
              : undefined,
            business: include?.business
              ? businesses.find((b) => b.id === row.businessId) ?? null
              : undefined,
          }));
        }
        return list;
      }),
      findFirst: vi.fn(async ({ where, include }) => {
        const row =
          tables.find(
            (t) =>
              (where?.id ? t.id === where.id : true) &&
              (where?.businessId ? t.businessId === where.businessId : true)
          ) ?? null;
        if (!row) return null;
        return {
          ...row,
          qrCode: include?.qrCode ? qrCodes.find((q) => q.tableId === row.id) ?? null : undefined,
          business: include?.business ? businesses.find((b) => b.id === row.businessId) ?? null : undefined,
        };
      }),
      aggregate: vi.fn(async ({ where }) => {
        const list = tables.filter((t) => t.businessId === where.businessId);
        return { _max: { tableNumber: list.length ? Math.max(...list.map((t) => t.tableNumber)) : null } };
      }),
      create: vi.fn(async ({ data }) => {
        const row: TableRecord = {
          id: nextTableId(),
          businessId: data.businessId,
          tableNumber: data.tableNumber,
          label: data.label ?? null,
          isActive: data.isActive ?? true,
          createdAt: new Date(),
        };
        tables.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const table of tables) {
          if (table.id === where.id && table.businessId === where.businessId) {
            Object.assign(table, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    qrCode: {
      create: vi.fn(async ({ data, select }) => {
        const row: QrCodeRecord = {
          id: nextQrId(),
          businessId: data.businessId,
          tableId: data.tableId,
          uniqueCode: data.uniqueCode,
          qrImageUrl: data.qrImageUrl ?? null,
          createdAt: new Date(),
        };
        qrCodes.push(row);
        if (select) {
          return {
            id: row.id,
            uniqueCode: row.uniqueCode,
            createdAt: row.createdAt,
          };
        }
        return row;
      }),
      findUnique: vi.fn(async ({ where }) => {
        if (where?.tableId) return qrCodes.find((row) => row.tableId === where.tableId) ?? null;
        if (where?.id) return qrCodes.find((row) => row.id === where.id) ?? null;
        return null;
      }),
      findFirst: vi.fn(async ({ where }) => {
        return (
          qrCodes.find(
            (row) =>
              (where?.tableId ? row.tableId === where.tableId : true) &&
              (where?.businessId ? row.businessId === where.businessId : true)
          ) ?? null
        );
      }),
      update: vi.fn(async ({ where, data }) => {
        const idx = qrCodes.findIndex((row) => row.id === where.id);
        qrCodes[idx] = { ...qrCodes[idx], ...data };
        return qrCodes[idx];
      }),
    },
    qrCodeRotation: {
      findMany: vi.fn(async ({ where, orderBy, take }) => {
        let list = [...qrRotations];
        if (where?.qrCodeId?.in) list = list.filter((row) => where.qrCodeId.in.includes(row.qrCodeId));
        if (where?.qrCodeId && typeof where.qrCodeId === "string") {
          list = list.filter((row) => row.qrCodeId === where.qrCodeId);
        }
        if (orderBy?.createdAt === "desc") {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (typeof take === "number") list = list.slice(0, take);
        return list;
      }),
      create: vi.fn(async ({ data }) => {
        const row: QrRotationRecord = {
          id: nextRotId(),
          qrCodeId: data.qrCodeId,
          oldToken: data.oldToken,
          newToken: data.newToken,
          rotatedByUserId: data.rotatedByUserId ?? null,
          reason: data.reason ?? null,
          graceExpiresAt: data.graceExpiresAt ?? null,
          createdAt: new Date(),
        };
        qrRotations.push(row);
        return row;
      }),
    },
    $transaction: vi.fn(async (cb) => cb({
      table: {
        create: async (args: any) => (await (await import("../src/prisma")).prisma.table.create(args)),
      },
      qrCode: {
        create: async (args: any) => (await (await import("../src/prisma")).prisma.qrCode.create(args)),
      },
    })),
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

  businessRouter.handle(req, res, (err: unknown) => {
    if (err) throw err;
  });
  await waitForResponseEnd(res);
  return res;
};

describe("Layer 5 table routes", () => {
  beforeEach(() => {
    users.length = 0;
    businesses.length = 0;
    tables.length = 0;
    qrCodes.length = 0;
    qrRotations.length = 0;
    businessMemberships.length = 0;
    users.push({ id: "u_business", email: "biz@example.com", role: "business" });
    businesses.push({
      id: "b_1",
      userId: "u_business",
      slug: "demo-biz",
      status: "approved",
      updatedAt: new Date(),
    });
  });

  it("blocks staff from table list", async () => {
    businessMemberships.push({
      id: nextBizMembershipId(),
      businessId: "b_1",
      userId: "u_business",
      role: "staff",
    });
    const res = await run("GET", "/tables", { user: users[0], headers: { "x-business-id": "b_1" } });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(403);
    expect(body.error.code).toBe("BUSINESS_ROLE_FORBIDDEN");
  });

  it("creates tables in bulk with sequential numbering and qr codes", async () => {
    const res = await run("POST", "/tables/bulk", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: { count: 3, labelPrefix: "Table" },
    });

    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData().data.createdCount).toBe(3);
    expect(res._getJSONData().data.tables[0].tableNumber).toBe(1);
    expect(res._getJSONData().data.tables[2].tableNumber).toBe(3);
    expect(qrCodes).toHaveLength(3);
  });

  it("lists tables with qr metadata and pagination", async () => {
    tables.push({
      id: "t_1",
      businessId: "b_1",
      tableNumber: 1,
      label: "Main 1",
      isActive: true,
      createdAt: new Date(),
    });
    qrCodes.push({
      id: "q_1",
      businessId: "b_1",
      tableId: "t_1",
      uniqueCode: "token-1",
      qrImageUrl: null,
      createdAt: new Date(),
    });
    qrRotations.push({
      id: "r_1",
      qrCodeId: "q_1",
      oldToken: "old-token-1",
      newToken: "token-1",
      rotatedByUserId: "u_business",
      reason: null,
      graceExpiresAt: null,
      createdAt: new Date(),
    });

    const res = await run("GET", "/tables?page=1&limit=10&includeInactive=false", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.total).toBe(1);
    expect(res._getJSONData().data.tables[0].qrCode.uniqueCode).toBe("token-1");
    expect(res._getJSONData().data.tables[0].lastRotatedAt).toBeTruthy();
  });

  it("updates table label and active state", async () => {
    tables.push({
      id: "t_1",
      businessId: "b_1",
      tableNumber: 1,
      label: "Old",
      isActive: true,
      createdAt: new Date(),
    });

    const res = await run("PATCH", "/tables/t_1", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: { label: "Patio 1", isActive: false },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.table.label).toBe("Patio 1");
    expect(res._getJSONData().data.table.isActive).toBe(false);
  });

  it("downloads single table qr image", async () => {
    tables.push({
      id: "t_1",
      businessId: "b_1",
      tableNumber: 7,
      label: "Seven",
      isActive: true,
      createdAt: new Date(),
    });
    qrCodes.push({
      id: "q_1",
      businessId: "b_1",
      tableId: "t_1",
      uniqueCode: "token-1",
      qrImageUrl: null,
      createdAt: new Date(),
    });

    const res = await run("GET", "/tables/t_1/qr/download?format=png", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("content-type")).toBe("image/png");
    expect(String(res.getHeader("content-disposition"))).toContain("table-7-qr.png");
    expect(res._getData()).toBeTruthy();
  });

  it("downloads batch qr zip", async () => {
    tables.push(
      {
        id: "t_1",
        businessId: "b_1",
        tableNumber: 1,
        label: null,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: "t_2",
        businessId: "b_1",
        tableNumber: 2,
        label: null,
        isActive: true,
        createdAt: new Date(),
      }
    );
    qrCodes.push(
      {
        id: "q_1",
        businessId: "b_1",
        tableId: "t_1",
        uniqueCode: "token-1",
        qrImageUrl: null,
        createdAt: new Date(),
      },
      {
        id: "q_2",
        businessId: "b_1",
        tableId: "t_2",
        uniqueCode: "token-2",
        qrImageUrl: null,
        createdAt: new Date(),
      }
    );

    const res = await run("POST", "/tables/qr/download", {
      user: users[0],
      headers: { "x-business-id": "b_1" },
      body: { format: "png" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("content-type")).toBe("application/zip");
    expect(String(res.getHeader("content-disposition"))).toContain("tables-qr-png.zip");
    expect(res._getData()).toBeTruthy();
  });
});
