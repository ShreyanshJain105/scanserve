import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadImageObjectMock } = vi.hoisted(() => ({
  uploadImageObjectMock: vi.fn(),
}));

vi.mock("../src/services/objectStorage", () => ({
  uploadImageObject: uploadImageObjectMock,
  resolveImageUrl: (imagePath: string | null) =>
    imagePath ? `http://localhost:9000/scan2serve-menu-images/${imagePath}` : null,
  extractImagePathFromUrl: (imageUrl: string | null) => {
    if (!imageUrl) return null;
    const marker = "/scan2serve-menu-images/";
    const idx = imageUrl.indexOf(marker);
    if (idx < 0) return null;
    return imageUrl.slice(idx + marker.length);
  },
}));
import businessRouter from "../src/routes/business";
import adminRouter from "../src/routes/admin";

type Role = "business" | "admin" | "customer";
type BusinessStatus = "pending" | "approved" | "rejected" | "archived";

type UserRecord = { id: string; email: string; role: Role };
type OrgRecord = { id: string; ownerUserId: string; name: string | null };
type OrgMembershipRecord = {
  id: string;
  orgId: string;
  userId: string;
};
type BusinessMembershipRecord = {
  id: string;
  businessId: string;
  userId: string;
  role: "owner" | "manager" | "staff";
};
type BusinessRecord = {
  id: string;
  userId: string;
  orgId?: string | null;
  name: string;
  slug: string;
  currencyCode: string;
  countryCode: string | null;
  timezone: string;
  description: string | null;
  logoUrl: string | null;
  address: string;
  phone: string;
  status: BusinessStatus;
  archivedAt?: Date | null;
  archivedPreviousStatus?: BusinessStatus | null;
  createdAt: Date;
  updatedAt: Date;
};
type RejectionRecord = {
  id: string;
  businessId: string;
  reason: string | null;
  createdAt: Date;
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

const users: UserRecord[] = [];
const orgs: OrgRecord[] = [];
const orgMemberships: OrgMembershipRecord[] = [];
const businessMemberships: BusinessMembershipRecord[] = [];
const businesses: BusinessRecord[] = [];
const rejections: RejectionRecord[] = [];
const tables: TableRecord[] = [];
const qrCodes: QrCodeRecord[] = [];

const withRejections = (business: BusinessRecord) => ({
  ...business,
  rejections: rejections
    .filter((item) => item.businessId === business.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 3),
});

vi.mock("../src/prisma", () => ({
  prisma: {
    org: {
      create: vi.fn(async ({ data }) => {
        const record: OrgRecord = {
          id: `org_${orgs.length + 1}`,
          ownerUserId: data.ownerUserId,
          name: data.name ?? null,
        };
        orgs.push(record);
        return record;
      }),
    },
    orgMembership: {
      findFirst: vi.fn(async ({ where, include }) => {
        const membership = orgMemberships.find((m) =>
          (where?.userId ? m.userId === where.userId : true) &&
          (where?.orgId ? m.orgId === where.orgId : true)
        );
        if (!membership) return null;
        if (include?.org) {
          return { ...membership, org: orgs.find((o) => o.id === membership.orgId) ?? null };
        }
        return membership;
      }),
      create: vi.fn(async ({ data }) => {
        const record: OrgMembershipRecord = {
          id: `orgmem_${orgMemberships.length + 1}`,
          orgId: data.orgId,
          userId: data.userId,
        };
        orgMemberships.push(record);
        return record;
      }),
      findMany: vi.fn(async ({ where }) =>
        orgMemberships.filter((m) =>
          (where?.orgId ? m.orgId === where.orgId : true) &&
          (where?.userId ? m.userId === where.userId : true)
        )
      ),
      delete: vi.fn(async ({ where }) => {
        const idx = orgMemberships.findIndex((m) => m.id === where.id);
        if (idx >= 0) orgMemberships.splice(idx, 1);
        return { id: where.id };
      }),
    },
    business: {
      create: vi.fn(async ({ data }) => {
        if (businesses.some((entry) => entry.slug === data.slug)) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        const created: BusinessRecord = {
          id: `b_${businesses.length + 1}`,
          userId: data.userId,
          orgId: data.orgId ?? null,
          name: data.name,
          slug: data.slug,
          currencyCode: data.currencyCode ?? "USD",
          countryCode: data.countryCode ?? null,
          timezone: data.timezone ?? "UTC",
          description: data.description ?? null,
          logoUrl: data.logoUrl ?? null,
          address: data.address,
          phone: data.phone,
          status: data.status,
          archivedAt: data.archivedAt ?? null,
          archivedPreviousStatus: data.archivedPreviousStatus ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        businesses.push(created);
        return created;
      }),
      findMany: vi.fn(async ({ where, include }) => {
        let list = [...businesses];
        if (where?.userId) list = list.filter((item) => item.userId === where.userId);
        if (where?.orgId) list = list.filter((item) => item.orgId === where.orgId);
        if (where?.status) list = list.filter((item) => item.status === where.status);
        list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return include?.rejections ? list.map(withRejections) : list;
      }),
      findFirst: vi.fn(async ({ where }) => {
        let list = [...businesses];
        if (where?.userId) list = list.filter((item) => item.userId === where.userId);
        if (where?.id) list = list.filter((item) => item.id === where.id);
        if (where?.slug) list = list.filter((item) => item.slug === where.slug);
        list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return list[0] ?? null;
      }),
      findUnique: vi.fn(async ({ where, include }) => {
        const business = businesses.find((item) => item.id === where.id) ?? null;
        if (!business) return null;
        return include?.rejections ? withRejections(business) : business;
      }),
      update: vi.fn(async ({ where, data, include }) => {
        const index = businesses.findIndex((item) => item.id === where.id);
        if (index < 0) throw new Error("Business not found");
        if (data.slug && businesses.some((item) => item.slug === data.slug && item.id !== where.id)) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }

        businesses[index] = {
          ...businesses[index],
          ...data,
          updatedAt: new Date(),
        };

        return include?.rejections ? withRejections(businesses[index]) : businesses[index];
      }),
    },
    businessMembership: {
      findFirst: vi.fn(async ({ where }) =>
        businessMemberships.find(
          (m) =>
            (!where?.businessId || m.businessId === where.businessId) &&
            (!where?.userId || m.userId === where.userId)
        ) ?? null
      ),
      findMany: vi.fn(async ({ where, include }) => {
        const list = businessMemberships.filter((m) =>
          (where?.userId ? m.userId === where.userId : true)
        );
        if (include?.business) {
          return list.map((m) => ({
            ...m,
            business: businesses.find((b) => b.id === m.businessId) ?? null,
          }));
        }
        return list;
      }),
      create: vi.fn(async ({ data }) => {
        const record: BusinessMembershipRecord = {
          id: `bizmem_${businessMemberships.length + 1}`,
          businessId: data.businessId,
          userId: data.userId,
          role: data.role,
        };
        businessMemberships.push(record);
        return record;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const before = businessMemberships.length;
        for (let i = businessMemberships.length - 1; i >= 0; i -= 1) {
          if (where?.userId && businessMemberships[i].userId !== where.userId) continue;
          businessMemberships.splice(i, 1);
        }
        return { count: before - businessMemberships.length };
      }),
    },
    businessRejection: {
      findFirst: vi.fn(async ({ where }) => {
        const list = rejections
          .filter((item) => item.businessId === where.businessId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list[0] ?? null;
      }),
      create: vi.fn(async ({ data }) => {
        const created: RejectionRecord = {
          id: `r_${rejections.length + 1}`,
          businessId: data.businessId,
          reason: data.reason ?? null,
          createdAt: new Date(),
        };
        rejections.push(created);
        return created;
      }),
    },
    table: {
      findFirst: vi.fn(async ({ where }) => {
        let list = [...tables];
        if (where?.id) list = list.filter((item) => item.id === where.id);
        if (where?.businessId) list = list.filter((item) => item.businessId === where.businessId);
        return list[0] ?? null;
      }),
    },
    qrCode: {
      findUnique: vi.fn(async ({ where }) => {
        if (where?.tableId) {
          return qrCodes.find((item) => item.tableId === where.tableId) ?? null;
        }
        if (where?.id) {
          return qrCodes.find((item) => item.id === where.id) ?? null;
        }
        return null;
      }),
      findFirst: vi.fn(async ({ where }) => {
        let list = [...qrCodes];
        if (where?.tableId) list = list.filter((item) => item.tableId === where.tableId);
        if (where?.businessId) list = list.filter((item) => item.businessId === where.businessId);
        return list[0] ?? null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const index = qrCodes.findIndex((item) => item.id === where.id);
        if (index < 0) throw new Error("QrCode not found");
        qrCodes[index] = {
          ...qrCodes[index],
          uniqueCode: data.uniqueCode,
          qrImageUrl: data.qrImageUrl ?? null,
        };
        return qrCodes[index];
      }),
      create: vi.fn(async ({ data }) => {
        const created: QrCodeRecord = {
          id: `q_${qrCodes.length + 1}`,
          businessId: data.businessId,
          tableId: data.tableId,
          uniqueCode: data.uniqueCode,
          qrImageUrl: data.qrImageUrl ?? null,
          createdAt: new Date(),
        };
        qrCodes.push(created);
        return created;
      }),
      upsert: vi.fn(async ({ where, update, create }) => {
        const index = qrCodes.findIndex((item) => item.tableId === where.tableId);
        if (index >= 0) {
          qrCodes[index] = {
            ...qrCodes[index],
            uniqueCode: update.uniqueCode,
            qrImageUrl: update.qrImageUrl ?? null,
          };
          return qrCodes[index];
        }
        const created: QrCodeRecord = {
          id: `q_${qrCodes.length + 1}`,
          businessId: create.businessId,
          tableId: create.tableId,
          uniqueCode: create.uniqueCode,
          qrImageUrl: create.qrImageUrl ?? null,
          createdAt: new Date(),
        };
        qrCodes.push(created);
        return created;
      }),
    },
    qrCodeRotation: {
      create: vi.fn(async ({ data }) => ({
        id: `rot_${Date.now()}`,
        ...data,
        createdAt: new Date(),
      })),
      findMany: vi.fn(async ({ where, take }) =>
        [
          {
            id: "rot_1",
            qrCodeId: where.qrCodeId,
            oldToken: "old-token",
            newToken: "new-token",
            rotatedByUserId: "u_business",
            reason: "rotation",
            graceExpiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
          },
        ].slice(0, take ?? 20)
      ),
    },
    $transaction: vi.fn(async (operations) => {
      const result = [];
      for (const operation of operations) {
        result.push(await operation);
      }
      return result;
    }),
    user: {
      findUnique: vi.fn(async ({ where: { id } }) => users.find((item) => item.id === id) ?? null),
      findMany: vi.fn(async ({ where }) =>
        users.filter((item) => (where?.role ? item.role === where.role : true))
      ),
    },
    notificationEvent: {
      create: vi.fn(async ({ data }) => ({
        id: `ne_${Date.now()}`,
        ...data,
        createdAt: new Date(),
      })),
      findMany: vi.fn(async () => []),
    },
    notificationInbox: {
      create: vi.fn(async ({ data }) => ({
        id: `ni_${Date.now()}`,
        ...data,
        createdAt: new Date(),
      })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      delete: vi.fn(async () => ({ id: "ni_deleted" })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
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
  router: typeof businessRouter,
  method: string,
  url: string,
  {
    body,
    user,
    headers,
    file,
  }: {
    body?: unknown;
    user?: UserRecord;
    headers?: Record<string, string>;
    file?: {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).file = file;

  router.handle(req, res, (err: unknown) => {
    if (err) throw err;
  });

  await waitForResponseEnd(res);
  return res;
};

describe("Layer 3 onboarding routes", () => {
  beforeEach(() => {
    users.length = 0;
    orgs.length = 0;
    orgMemberships.length = 0;
    businessMemberships.length = 0;
    businesses.length = 0;
    rejections.length = 0;
    tables.length = 0;
    qrCodes.length = 0;
    uploadImageObjectMock.mockReset();

    users.push({ id: "u_business", email: "biz@example.com", role: "business" });
    users.push({ id: "u_business_2", email: "biz2@example.com", role: "business" });
    users.push({ id: "u_admin", email: "admin@example.com", role: "admin" });
  });

  it("creates, lists, gets and resubmits a business profile", async () => {
    const businessUser = users[0];

    const created = await run(businessRouter, "POST", "/profile", {
      user: businessUser,
      body: {
        name: "Cedar Cafe",
        currencyCode: "usd",
        countryCode: "US",
        timezone: "America/New_York",
        description: "Coffee and snacks",
        address: "12 Market Street",
        phone: "+1-202-000-0000",
      },
    });

    expect(created._getStatusCode()).toBe(201);
    expect(created._getJSONData().data.business.status).toBe("pending");
    expect(created._getJSONData().data.business.slug).toBe("cedar-cafe");
    expect(created._getJSONData().data.business.currencyCode).toBe("USD");

    const listed = await run(businessRouter, "GET", "/profiles", { user: businessUser });
    expect(listed._getStatusCode()).toBe(200);
    expect(listed._getJSONData().data.businesses).toHaveLength(1);

    const fetched = await run(businessRouter, "GET", "/profile", { user: businessUser });
    expect(fetched._getStatusCode()).toBe(200);
    expect(fetched._getJSONData().data.business.slug).toBe("cedar-cafe");

    businesses[0].status = "rejected";
    rejections.push({
      id: "r_1",
      businessId: businesses[0].id,
      reason: "Missing address proof",
      createdAt: new Date(),
    });

    const patched = await run(businessRouter, "PATCH", "/profile", {
      user: businessUser,
      body: {
        businessId: businesses[0].id,
        address: "44 New Address",
      },
    });

    expect(patched._getStatusCode()).toBe(200);
    expect(patched._getJSONData().data.business.status).toBe("pending");
  });

  it("auto-generates unique slugs and rejects slug updates", async () => {
    const createdOne = await run(businessRouter, "POST", "/profile", {
      user: users[0],
      body: {
        name: "City Cafe",
        currencyCode: "INR",
        countryCode: "IN",
        timezone: "Asia/Kolkata",
        address: "12 Main Street",
        phone: "+91-111-111-1111",
      },
    });
    expect(createdOne._getStatusCode()).toBe(201);
    expect(createdOne._getJSONData().data.business.slug).toBe("city-cafe");

    const createdTwo = await run(businessRouter, "POST", "/profile", {
      user: users[1],
      body: {
        name: "City Cafe",
        currencyCode: "INR",
        countryCode: "IN",
        timezone: "Asia/Kolkata",
        address: "44 Main Street",
        phone: "+91-222-222-2222",
      },
    });
    expect(createdTwo._getStatusCode()).toBe(201);
    expect(createdTwo._getJSONData().data.business.slug).toBe("city-cafe-2");

    const immutable = await run(businessRouter, "PATCH", "/profile", {
      user: users[0],
      body: {
        businessId: createdOne._getJSONData().data.business.id,
        slug: "manual-change",
      },
    });
    expect(immutable._getStatusCode()).toBe(400);
    expect(immutable._getJSONData().error.code).toBe("SLUG_IMMUTABLE");
  });

  it("uploads business logo through profile logo endpoint", async () => {
    const created = await run(businessRouter, "POST", "/profile", {
      user: users[0],
      body: {
        name: "Logo Cafe",
        currencyCode: "USD",
        countryCode: "US",
        timezone: "America/New_York",
        address: "88 Street",
        phone: "+1-303-000-0000",
      },
    });
    const businessId = created._getJSONData().data.business.id as string;

    uploadImageObjectMock.mockResolvedValue({
      imagePath: `business/${businessId}/profile/logo/abc-logo.jpg`,
      imageUrl: "http://localhost:9000/scan2serve-menu-images/business/logo.jpg",
    });

    const uploadRes = await run(businessRouter, "POST", "/profile/logo", {
      user: users[0],
      body: { businessId },
      file: {
        fieldname: "logo",
        originalname: "logo.jpg",
        encoding: "7bit",
        mimetype: "image/jpeg",
        size: 4,
        buffer: Buffer.from("logo"),
      },
    });
    expect(uploadRes._getStatusCode()).toBe(200);
    expect(uploadRes._getJSONData().data.business.logoUrl).toContain("/business/logo.jpg");
  });

  it("enforces admin moderation transitions", async () => {
    const adminUser = users[2];

    businesses.push({
      id: "b_pending",
      userId: users[0].id,
      name: "Pending Bistro",
      slug: "pending-bistro",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "America/New_York",
      description: null,
      logoUrl: null,
      address: "A",
      phone: "1234567",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    businesses.push({
      id: "b_approved",
      userId: users[0].id,
      name: "Approved Bistro",
      slug: "approved-bistro",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "America/New_York",
      description: null,
      logoUrl: null,
      address: "B",
      phone: "1234567",
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const listed = await run(adminRouter, "GET", "/businesses", { user: adminUser });
    expect(listed._getStatusCode()).toBe(200);
    expect(listed._getJSONData().data.businesses).toHaveLength(2);

    const approved = await run(adminRouter, "PATCH", "/businesses/b_pending/approve", {
      user: adminUser,
    });
    expect(approved._getStatusCode()).toBe(200);
    expect(approved._getJSONData().data.business.status).toBe("approved");

    const invalid = await run(adminRouter, "PATCH", "/businesses/b_pending/approve", {
      user: adminUser,
    });
    expect(invalid._getStatusCode()).toBe(409);

    businesses[0].status = "pending";
    const rejected = await run(adminRouter, "PATCH", "/businesses/b_pending/reject", {
      user: adminUser,
      body: { reason: "Missing legal docs" },
    });
    expect(rejected._getStatusCode()).toBe(200);
    expect(rejected._getJSONData().data.business.status).toBe("rejected");
  });

  it("gates business operation routes by status", async () => {
    const businessUser = users[0];

    const noProfile = await run(businessRouter, "GET", "/ops/ping", {
      user: businessUser,
    });
    expect(noProfile._getStatusCode()).toBe(403);
    expect(noProfile._getJSONData().error.code).toBe("BUSINESS_PROFILE_REQUIRED");

    businesses.push({
      id: "b_gate",
      userId: users[0].id,
      name: "Gate Bistro",
      slug: "gate-bistro",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "America/New_York",
      description: null,
      logoUrl: null,
      address: "A",
      phone: "1234567",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const pending = await run(businessRouter, "GET", "/ops/ping", {
      user: businessUser,
      headers: { "x-business-id": "b_gate" },
    });
    expect(pending._getStatusCode()).toBe(403);
    expect(pending._getJSONData().error.code).toBe("BUSINESS_PENDING_APPROVAL");

    businesses[0].status = "rejected";
    rejections.push({
      id: "r_gate",
      businessId: "b_gate",
      reason: "Incomplete phone",
      createdAt: new Date(),
    });

    const rejected = await run(businessRouter, "GET", "/ops/ping", {
      user: businessUser,
      headers: { "x-business-id": "b_gate" },
    });
    expect(rejected._getStatusCode()).toBe(403);
    expect(rejected._getJSONData().error.code).toBe("BUSINESS_REJECTED");

    businesses[0].status = "approved";
    const approved = await run(businessRouter, "GET", "/ops/ping", {
      user: businessUser,
      headers: { "x-business-id": "b_gate" },
    });
    expect(approved._getStatusCode()).toBe(200);
    expect(approved._getJSONData().status).toBe(1);
  });

  it("archives and restores business profiles within retention window", async () => {
    const businessUser = users[0];
    businesses.push({
      id: "b_archive",
      userId: businessUser.id,
      name: "Archive Cafe",
      slug: "archive-cafe",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "America/New_York",
      description: null,
      logoUrl: null,
      address: "A",
      phone: "1234567",
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const archived = await run(businessRouter, "PATCH", "/profile/archive", {
      user: businessUser,
      body: { businessId: "b_archive" },
    });
    expect(archived._getStatusCode()).toBe(200);
    expect(archived._getJSONData().data.business.status).toBe("archived");

    const blocked = await run(businessRouter, "GET", "/ops/ping", {
      user: businessUser,
      headers: { "x-business-id": "b_archive" },
    });
    expect(blocked._getStatusCode()).toBe(403);
    expect(blocked._getJSONData().error.code).toBe("BUSINESS_ARCHIVED");

    const restored = await run(businessRouter, "PATCH", "/profile/restore", {
      user: businessUser,
      body: { businessId: "b_archive" },
    });
    expect(restored._getStatusCode()).toBe(200);
    expect(restored._getJSONData().data.business.status).toBe("approved");
  });

  it("rejects restore after archive retention window expires", async () => {
    const businessUser = users[0];
    businesses.push({
      id: "b_archive_old",
      userId: businessUser.id,
      name: "Old Archive",
      slug: "old-archive",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "America/New_York",
      description: null,
      logoUrl: null,
      address: "A",
      phone: "1234567",
      status: "archived",
      archivedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      archivedPreviousStatus: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const restored = await run(businessRouter, "PATCH", "/profile/restore", {
      user: businessUser,
      body: { businessId: "b_archive_old" },
    });
    expect(restored._getStatusCode()).toBe(409);
    expect(restored._getJSONData().error.code).toBe("BUSINESS_ARCHIVE_EXPIRED");
  });

  it("regenerates QR token for an approved business table", async () => {
    const businessUser = users[0];
    businesses.push({
      id: "b_qr",
      userId: users[0].id,
      name: "QR Bistro",
      slug: "qr-bistro",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "America/New_York",
      description: null,
      logoUrl: null,
      address: "A",
      phone: "1234567",
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    tables.push({
      id: "t_qr",
      businessId: "b_qr",
      tableNumber: 1,
      label: "Table 1",
      isActive: true,
      createdAt: new Date(),
    });

    const first = await run(
      businessRouter,
      "POST",
      "/tables/t_qr/qr/regenerate",
      {
        user: businessUser,
        headers: { "x-business-id": "b_qr" },
      }
    );
    expect(first._getStatusCode()).toBe(200);
    const tokenOne = first._getJSONData().data.qrCode.uniqueCode;
    expect(typeof tokenOne).toBe("string");
    expect(tokenOne.length).toBeGreaterThan(20);

    const second = await run(
      businessRouter,
      "POST",
      "/tables/t_qr/qr/regenerate",
      {
        user: businessUser,
        headers: { "x-business-id": "b_qr" },
      }
    );
    expect(second._getStatusCode()).toBe(200);
    const tokenTwo = second._getJSONData().data.qrCode.uniqueCode;
    expect(tokenTwo).not.toBe(tokenOne);
  });

  it("lists QR rotation history for table", async () => {
    const businessUser = users[0];
    businesses.push({
      id: "b_hist",
      userId: users[0].id,
      name: "QR Hist",
      slug: "qr-hist",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "America/New_York",
      description: null,
      logoUrl: null,
      address: "A",
      phone: "1234567",
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    tables.push({
      id: "t_hist",
      businessId: "b_hist",
      tableNumber: 2,
      label: "Table 2",
      isActive: true,
      createdAt: new Date(),
    });

    qrCodes.push({
      id: "q_hist",
      businessId: "b_hist",
      tableId: "t_hist",
      uniqueCode: "active-token",
      qrImageUrl: null,
      createdAt: new Date(),
    });

    const listed = await run(
      businessRouter,
      "GET",
      "/tables/t_hist/qr/rotations?limit=5",
      {
        user: businessUser,
        headers: { "x-business-id": "b_hist" },
      }
    );

    expect(listed._getStatusCode()).toBe(200);
    expect(listed._getJSONData().status).toBe(1);
    expect(Array.isArray(listed._getJSONData().data.rotations)).toBe(true);
  });
});
