import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import businessRouter from "../src/routes/business";

type UserRole = "business" | "admin" | "customer";
type OrgRole = "owner" | "manager" | "staff";
type OrgInviteStatus = "pending" | "accepted" | "declined";
type BusinessRole = "owner" | "manager" | "staff";

type UserRecord = { id: string; email: string; role: UserRole };
type OrgRecord = { id: string; ownerUserId: string; name: string | null };
type OrgMembershipRecord = { id: string; orgId: string; userId: string; role: OrgRole };
type OrgInviteRecord = {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  status: OrgInviteStatus;
  respondedAt: Date | null;
};
type BusinessRecord = { id: string; orgId: string | null; userId: string; name: string };
type BusinessMembershipRecord = {
  id: string;
  businessId: string;
  userId: string;
  role: BusinessRole;
};
type NotificationEventRecord = {
  id: string;
  userId: string;
  actorUserId: string | null;
  businessId: string | null;
  type: string;
  message: string;
  payload: unknown;
};
type NotificationInboxRecord = { id: string; userId: string; eventId: string };

const store = vi.hoisted(() => ({
  users: [] as UserRecord[],
  orgs: [] as OrgRecord[],
  orgMemberships: [] as OrgMembershipRecord[],
  orgInvites: [] as OrgInviteRecord[],
  businesses: [] as BusinessRecord[],
  businessMemberships: [] as BusinessMembershipRecord[],
  notificationEvents: [] as NotificationEventRecord[],
  notificationInbox: [] as NotificationInboxRecord[],
}));

const nextId = (prefix: string, list: Array<unknown>) => `${prefix}_${list.length + 1}`;

const prismaMock = vi.hoisted(() => {
  const mock: any = {
    user: {
      findUnique: vi.fn(async ({ where }) => {
        if (where?.id) return store.users.find((u) => u.id === where.id) ?? null;
        if (where?.email)
          return store.users.find((u) => u.email === where.email) ?? null;
        return null;
      }),
    },
    org: {
      create: vi.fn(async ({ data }) => {
        const org = {
          id: nextId("org", store.orgs),
          ownerUserId: data.ownerUserId,
          name: data.name ?? null,
        };
        store.orgs.push(org);
        return org;
      }),
    },
    orgMembership: {
      findFirst: vi.fn(async ({ where, include }) => {
        const membership = store.orgMemberships.find((m) =>
          (where?.userId ? m.userId === where.userId : true) &&
          (where?.orgId ? m.orgId === where.orgId : true)
        );
        if (!membership) return null;
        if (include?.org) {
          return {
            ...membership,
            org: store.orgs.find((o) => o.id === membership.orgId) ?? null,
          };
        }
        return membership;
      }),
      findMany: vi.fn(async ({ where, select }) => {
        const list = store.orgMemberships.filter((m) =>
          (where?.orgId ? m.orgId === where.orgId : true) &&
          (where?.role?.in ? where.role.in.includes(m.role) : true)
        );
        if (select?.userId) {
          return list.map((m) => ({ userId: m.userId }));
        }
        return list;
      }),
      create: vi.fn(async ({ data }) => {
        const record = {
          id: nextId("orgmem", store.orgMemberships),
          orgId: data.orgId,
          userId: data.userId,
          role: data.role,
        };
        store.orgMemberships.push(record);
        return record;
      }),
      delete: vi.fn(async ({ where }) => {
        const idx = store.orgMemberships.findIndex((m) => m.id === where.id);
        if (idx >= 0) store.orgMemberships.splice(idx, 1);
        return { id: where.id };
      }),
    },
    orgInvite: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          store.orgInvites.find((inv) =>
            (where?.id ? inv.id === where.id : true) &&
            (where?.orgId ? inv.orgId === where.orgId : true) &&
            (where?.userId ? inv.userId === where.userId : true) &&
            (where?.status ? inv.status === where.status : true)
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }) => {
        const invite = {
          id: nextId("invite", store.orgInvites),
          orgId: data.orgId,
          userId: data.userId,
          role: data.role,
          status: data.status ?? "pending",
          respondedAt: null,
        };
        store.orgInvites.push(invite);
        return invite;
      }),
      update: vi.fn(async ({ where, data }) => {
        const invite = store.orgInvites.find((inv) => inv.id === where.id);
        if (!invite) return null;
        Object.assign(invite, data);
        return invite;
      }),
    },
    business: {
      findFirst: vi.fn(async ({ where, select }) => {
        const business = store.businesses.find((b) =>
          (where?.id ? b.id === where.id : true) &&
          (where?.orgId ? b.orgId === where.orgId : true)
        );
        if (!business) return null;
        if (select) {
          return { id: business.id, orgId: business.orgId, name: business.name };
        }
        return business;
      }),
    },
    businessMembership: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          store.businessMemberships.find((m) =>
            (where?.businessId ? m.businessId === where.businessId : true) &&
            (where?.userId ? m.userId === where.userId : true)
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }) => {
        const record = {
          id: nextId("bizmem", store.businessMemberships),
          businessId: data.businessId,
          userId: data.userId,
          role: data.role,
        };
        store.businessMemberships.push(record);
        return record;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const before = store.businessMemberships.length;
        for (let i = store.businessMemberships.length - 1; i >= 0; i -= 1) {
          if (where?.userId && store.businessMemberships[i].userId !== where.userId) continue;
          store.businessMemberships.splice(i, 1);
        }
        return { count: before - store.businessMemberships.length };
      }),
    },
    notificationEvent: {
      create: vi.fn(async ({ data }) => {
        const record = {
          id: nextId("event", store.notificationEvents),
          userId: data.userId,
          actorUserId: data.actorUserId ?? null,
          businessId: data.businessId ?? null,
          type: data.type,
          message: data.message,
          payload: data.payload ?? null,
        };
        store.notificationEvents.push(record);
        return record;
      }),
    },
    notificationInbox: {
      create: vi.fn(async ({ data }) => {
        const record = { id: nextId("inbox", store.notificationInbox), ...data };
        store.notificationInbox.push(record);
        return record;
      }),
    },
  };
  mock.$transaction = vi.fn(async (callback: any) => callback(mock));
  return mock;
});

vi.mock("../src/prisma", () => ({
  prisma: prismaMock,
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
  }: {
    body?: unknown;
    user?: UserRecord;
  } = {}
) => {
  const token = user ? makeToken(user) : null;
  const { req, res } = createMocks({
    method,
    url,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

describe("Org invites and memberships", () => {
  beforeEach(() => {
    store.users.length = 0;
    store.orgs.length = 0;
    store.orgMemberships.length = 0;
    store.orgInvites.length = 0;
    store.businesses.length = 0;
    store.businessMemberships.length = 0;
    store.notificationEvents.length = 0;
    store.notificationInbox.length = 0;

    store.users.push({ id: "u_owner", email: "owner@example.com", role: "business" });
    store.users.push({ id: "u_target", email: "target@example.com", role: "business" });
    store.orgs.push({ id: "org_1", ownerUserId: "u_owner", name: "Owner Org" });
    store.orgMemberships.push({ id: "orgmem_1", orgId: "org_1", userId: "u_owner", role: "owner" });
    store.businesses.push({ id: "biz_1", orgId: "org_1", userId: "u_owner", name: "Cafe" });
  });

  it("checks invite email existence", async () => {
    const res = await run("GET", "/org/invites/check?email=target@example.com", {
      user: store.users[0],
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.exists).toBe(true);
  });

  it("creates org invite and notifies user", async () => {
    const res = await run("POST", "/org/invites", {
      user: store.users[0],
      body: { email: "target@example.com", role: "staff" },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.inviteId).toBeTruthy();
    expect(store.orgInvites).toHaveLength(1);
    expect(store.notificationInbox).toHaveLength(1);
  });

  it("rejects invite when user already in org", async () => {
    store.orgMemberships.push({ id: "orgmem_2", orgId: "org_2", userId: "u_target", role: "staff" });
    const res = await run("POST", "/org/invites", {
      user: store.users[0],
      body: { email: "target@example.com", role: "staff" },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(409);
    expect(body.error.code).toBe("ORG_ALREADY_JOINED");
  });

  it("accepts org invite and creates membership", async () => {
    store.orgInvites.push({
      id: "invite_1",
      orgId: "org_1",
      userId: "u_target",
      role: "staff",
      status: "pending",
      respondedAt: null,
    });
    const res = await run("POST", "/org/invites/invite_1/accept", {
      user: store.users[1],
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.accepted).toBe(true);
    expect(store.orgMemberships.some((m) => m.userId === "u_target")).toBe(true);
  });

  it("declines org invite", async () => {
    store.orgInvites.push({
      id: "invite_2",
      orgId: "org_1",
      userId: "u_target",
      role: "staff",
      status: "pending",
      respondedAt: null,
    });
    const res = await run("POST", "/org/invites/invite_2/decline", {
      user: store.users[1],
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.declined).toBe(true);
    expect(store.orgInvites.find((inv) => inv.id === "invite_2")?.status).toBe("declined");
  });

  it("allows staff to leave org and removes business memberships", async () => {
    store.orgMemberships.push({ id: "orgmem_3", orgId: "org_1", userId: "u_target", role: "staff" });
    store.businessMemberships.push({
      id: "bizmem_1",
      businessId: "biz_1",
      userId: "u_target",
      role: "staff",
    });
    const res = await run("POST", "/org/leave", { user: store.users[1] });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.left).toBe(true);
    expect(store.orgMemberships.some((m) => m.userId === "u_target")).toBe(false);
  });

  it("prevents owner from leaving org", async () => {
    const res = await run("POST", "/org/leave", { user: store.users[0] });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(403);
    expect(body.error.code).toBe("ORG_OWNER_CANNOT_LEAVE");
  });

  it("manager can add staff to business but not manager", async () => {
    store.orgMemberships.push({ id: "orgmem_4", orgId: "org_1", userId: "u_target", role: "manager" });

    const addManager = await run("POST", "/memberships", {
      user: store.users[1],
      body: { businessId: "biz_1", userId: "u_owner", role: "manager" },
    });
    const addManagerBody = JSON.parse(addManager._getData());
    expect(addManager.statusCode).toBe(403);
    expect(addManagerBody.error.code).toBe("BUSINESS_ROLE_FORBIDDEN");

    const addStaff = await run("POST", "/memberships", {
      user: store.users[1],
      body: { businessId: "biz_1", userId: "u_owner", role: "staff" },
    });
    expect(addStaff.statusCode).toBe(200);
    expect(store.businessMemberships.some((m) => m.role === "staff")).toBe(true);
  });
});

describe("Org create and membership lookup", () => {
  beforeEach(() => {
    store.users.length = 0;
    store.orgs.length = 0;
    store.orgMemberships.length = 0;
    store.orgInvites.length = 0;
    store.businesses.length = 0;
    store.businessMemberships.length = 0;
    store.notificationEvents.length = 0;
    store.notificationInbox.length = 0;

    store.users.push({ id: "u_owner", email: "owner@example.com", role: "business" });
  });

  it("returns null membership when user has no org", async () => {
    const res = await run("GET", "/org/membership", { user: store.users[0] });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.membership).toBeNull();
  });

  it("returns membership and org name when user belongs to org", async () => {
    store.orgs.push({ id: "org_1", ownerUserId: "u_owner", name: "Owner Org" });
    store.orgMemberships.push({ id: "orgmem_1", orgId: "org_1", userId: "u_owner", role: "owner" });

    const res = await run("GET", "/org/membership", { user: store.users[0] });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.membership.orgId).toBe("org_1");
    expect(body.data.membership.orgName).toBe("Owner Org");
  });

  it("creates org and owner membership", async () => {
    const res = await run("POST", "/org", {
      user: store.users[0],
      body: { name: "New Org" },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(200);
    expect(body.data.org.id).toBeTruthy();
    expect(store.orgs).toHaveLength(1);
    expect(store.orgMemberships).toHaveLength(1);
    expect(store.orgMemberships[0].role).toBe("owner");
  });

  it("rejects org creation when user already belongs to org", async () => {
    store.orgs.push({ id: "org_1", ownerUserId: "u_owner", name: "Owner Org" });
    store.orgMemberships.push({ id: "orgmem_1", orgId: "org_1", userId: "u_owner", role: "owner" });

    const res = await run("POST", "/org", {
      user: store.users[0],
      body: { name: "Duplicate Org" },
    });
    const body = JSON.parse(res._getData());
    expect(res.statusCode).toBe(409);
    expect(body.error.code).toBe("ORG_ALREADY_JOINED");
  });
});
