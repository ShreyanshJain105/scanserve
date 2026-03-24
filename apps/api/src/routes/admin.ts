import express from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";

const router: express.Router = express.Router();

const statusSchema = z.enum(["pending", "approved", "rejected", "archived"]);
const rejectSchema = z.object({
  reason: z.string().max(2000).optional().nullable(),
});
const blockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().max(2000).optional().nullable(),
});
const updateStatusSchema = z.enum(["pending", "approved", "rejected"]);
const notificationType = {
  APPROVED: "UPDATE_APPROVED" as const,
  REJECTED: "UPDATE_REJECTED" as const,
  BLOCKED: "BUSINESS_BLOCKED" as const,
  UNBLOCKED: "BUSINESS_UNBLOCKED" as const,
};

type RawBusiness = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  currencyCode: string;
  description: string | null;
  logoUrl: string | null;
  address: string;
  phone: string;
  status: "pending" | "approved" | "rejected" | "archived";
  blocked: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  rejections?: { id: string; reason: string | null; createdAt: Date }[];
};

const serializeBusiness = (business: RawBusiness) => ({
  id: business.id,
  userId: business.userId,
  name: business.name,
  slug: business.slug,
  currencyCode: business.currencyCode,
  description: business.description,
  logoUrl: business.logoUrl,
  address: business.address,
  phone: business.phone,
  status: business.status,
  blocked: business.blocked,
  archivedAt: business.archivedAt ? business.archivedAt.toISOString() : null,
  createdAt: business.createdAt.toISOString(),
  updatedAt: business.updatedAt.toISOString(),
  rejections: business.rejections?.map((item) => ({
    id: item.id,
    reason: item.reason,
    createdAt: item.createdAt.toISOString(),
  })),
});

const createNotificationEvent = async (params: {
  targetUserId: string;
  actorUserId?: string | null;
  businessId?: string | null;
  type: string;
  message: string;
  payload?: unknown;
}) => {
  const event = await prisma.notificationEvent.create({
    data: {
      userId: params.targetUserId,
      actorUserId: params.actorUserId ?? null,
      businessId: params.businessId ?? null,
      type: params.type,
      message: params.message,
      payload: params.payload as Prisma.JsonValue | undefined,
    },
  });
  await prisma.notificationInbox.create({
    data: {
      userId: params.targetUserId,
      eventId: event.id,
    },
  });
  return event;
};

const serializeNotification = (
  event: {
    id: string;
    businessId: string | null;
    type: string;
    message: string;
    payload: Prisma.JsonValue | null;
    createdAt: Date;
    actorUserId: string | null;
    business?: { id: string; name: string } | null;
  },
  inboxId?: string | null
) => ({
  id: event.id,
  inboxId: inboxId ?? null,
  businessId: event.businessId,
  businessName: event.business?.name ?? "Business",
  type: event.type,
  message: event.message,
  payload: event.payload ?? undefined,
  actorUserId: event.actorUserId,
  createdAt: event.createdAt.toISOString(),
});

router.use(requireAuth, requireRole("admin"));

router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === "all" ? "all" : "unread";
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const unreadCountPromise = prisma.notificationInbox.count({
      where: { userId: req.user!.id },
    });

    if (scope === "unread") {
      const inboxRows = await prisma.notificationInbox.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          event: {
            include: { business: { select: { id: true, name: true } } },
          },
        },
      });
      const unreadCount = await unreadCountPromise;
      sendSuccess(res, {
        scope: "unread",
        unreadCount,
        notifications: inboxRows.map((row: (typeof inboxRows)[number]) =>
          serializeNotification(row.event, row.id)
        ),
      });
      return;
    }

    const events = await prisma.notificationEvent.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: { business: { select: { id: true, name: true } } },
    });
    const unreadCount = await unreadCountPromise;
    sendSuccess(res, {
      scope: "all",
      unreadCount,
      notifications: events.map((event: (typeof events)[number]) =>
        serializeNotification(event, null)
      ),
    });
  })
);

router.post(
  "/notifications/:inboxId/read",
  asyncHandler(async (req, res) => {
    const inboxId = req.params.inboxId;
    const existing = await prisma.notificationInbox.findFirst({
      where: { id: inboxId, userId: req.user!.id },
    });
    if (!existing) {
      sendError(res, "Notification not found", 404, "NOTIFICATION_NOT_FOUND");
      return;
    }
    await prisma.notificationInbox.delete({ where: { id: inboxId } });
    const unreadCount = await prisma.notificationInbox.count({ where: { userId: req.user!.id } });
    sendSuccess(res, { unreadCount });
  })
);

router.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notificationInbox.deleteMany({ where: { userId: req.user!.id } });
    sendSuccess(res, { unreadCount: 0 });
  })
);

router.get(
  "/businesses",
  asyncHandler(async (req, res) => {
    const statusQuery = req.query.status;
    let statusFilter: "pending" | "approved" | "rejected" | "archived" | undefined;

    if (typeof statusQuery === "string") {
      const parsed = statusSchema.safeParse(statusQuery);
      if (!parsed.success) {
        sendError(res, "Invalid status filter", 400, "VALIDATION_ERROR");
        return;
      }
      statusFilter = parsed.data;
    }

    const businesses = await prisma.business.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    sendSuccess(res, {
      businesses: businesses.map((business: RawBusiness) => serializeBusiness(business)),
    });
  })
);

router.patch(
  "/businesses/:id/approve",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
    });

    if (!business) {
      sendError(res, "Business not found", 404, "BUSINESS_NOT_FOUND");
      return;
    }

    if (business.status !== "pending") {
      sendError(
        res,
        "Only pending businesses can be approved",
        409,
        "INVALID_STATUS_TRANSITION"
      );
      return;
    }

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { status: "approved" },
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });
    await createNotificationEvent({
      targetUserId: business.userId,
      actorUserId: req.user!.id,
      businessId: business.id,
      type: "BUSINESS_APPROVED",
      message: "Your business has been approved.",
    });

    sendSuccess(res, { business: serializeBusiness(updated as RawBusiness) });
  })
);

router.patch(
  "/businesses/:id/reject",
  asyncHandler(async (req, res) => {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
    });

    if (!business) {
      sendError(res, "Business not found", 404, "BUSINESS_NOT_FOUND");
      return;
    }

    if (business.status !== "pending") {
      sendError(
        res,
        "Only pending businesses can be rejected",
        409,
        "INVALID_STATUS_TRANSITION"
      );
      return;
    }

    const [, updated] = await prisma.$transaction([
      prisma.businessRejection.create({
        data: {
          businessId: business.id,
          reason: parsed.data.reason ?? null,
        },
      }),
      prisma.business.update({
        where: { id: business.id },
        data: { status: "rejected" },
        include: {
          rejections: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      }),
    ]);
    await createNotificationEvent({
      targetUserId: business.userId,
      actorUserId: req.user!.id,
      businessId: business.id,
      type: "BUSINESS_REJECTED",
      message: "Your business was rejected.",
      payload: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
    });

    sendSuccess(res, { business: serializeBusiness(updated as RawBusiness) });
  })
);

router.patch(
  "/businesses/:id/block",
  asyncHandler(async (req, res) => {
    const parsed = blockSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business) {
      sendError(res, "Business not found", 404, "BUSINESS_NOT_FOUND");
      return;
    }
    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { blocked: parsed.data.blocked },
    });
    await createNotificationEvent({
      targetUserId: business.userId,
      actorUserId: req.user!.id,
      businessId: business.id,
      type: parsed.data.blocked ? notificationType.BLOCKED : notificationType.UNBLOCKED,
      message: parsed.data.blocked
        ? "Your business has been blocked by admin."
        : "Your business has been unblocked by admin.",
      payload: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
    });
    sendSuccess(res, { business: serializeBusiness(updated as unknown as RawBusiness) });
  })
);

router.get(
  "/businesses/:id/updates",
  asyncHandler(async (req, res) => {
    const statusParam = req.query.status;
    let statusFilter: "pending" | "approved" | "rejected" | undefined;
    if (typeof statusParam === "string") {
      const parsed = updateStatusSchema.safeParse(statusParam);
      if (!parsed.success) {
        sendError(res, "Invalid status filter", 400, "VALIDATION_ERROR");
        return;
      }
      statusFilter = parsed.data;
    }

    const updates = await prisma.businessUpdateRequest.findMany({
      where: { businessId: req.params.id, status: statusFilter },
      orderBy: { createdAt: "desc" },
    });

    sendSuccess(res, {
      updates: updates.map((u: typeof updates[number]) => ({
        id: u.id,
        status: u.status,
        payload: u.payload,
        reviewNote: u.reviewNote,
        reviewedBy: u.reviewedBy,
        reviewedAt: u.reviewedAt ? u.reviewedAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
    });
  })
);

router.patch(
  "/businesses/:id/updates/:updateId/approve",
  asyncHandler(async (req, res) => {
    const update = await prisma.businessUpdateRequest.findFirst({
      where: { id: req.params.updateId, businessId: req.params.id },
    });
    if (!update) {
      sendError(res, "Update request not found", 404, "UPDATE_NOT_FOUND");
      return;
    }
    if (update.status !== "pending") {
      sendError(res, "Only pending updates can be approved", 409, "INVALID_STATUS_TRANSITION");
      return;
    }

    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business) {
      sendError(res, "Business not found", 404, "BUSINESS_NOT_FOUND");
      return;
    }

    const payload = update.payload as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    ["name", "currencyCode", "description", "address", "phone", "logoUrl"].forEach((key) => {
      if (payload[key] !== undefined) allowed[key] = payload[key];
    });

    const [updatedBusiness] = await prisma.$transaction([
      prisma.business.update({
        where: { id: business.id },
        data: allowed,
      }),
      prisma.businessUpdateRequest.update({
        where: { id: update.id },
        data: {
          status: "approved",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
      }),
    ]);
    await createNotificationEvent({
      targetUserId: business.userId,
      actorUserId: req.user!.id,
      businessId: business.id,
      type: notificationType.APPROVED,
      message: "Your profile updates were approved.",
      payload: allowed,
    });

    sendSuccess(res, { business: serializeBusiness(updatedBusiness as unknown as RawBusiness) });
  })
);

router.patch(
  "/businesses/:id/updates/:updateId/reject",
  asyncHandler(async (req, res) => {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const update = await prisma.businessUpdateRequest.findFirst({
      where: { id: req.params.updateId, businessId: req.params.id },
    });
    if (!update) {
      sendError(res, "Update request not found", 404, "UPDATE_NOT_FOUND");
      return;
    }
    if (update.status !== "pending") {
      sendError(res, "Only pending updates can be rejected", 409, "INVALID_STATUS_TRANSITION");
      return;
    }

    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business) {
      sendError(res, "Business not found", 404, "BUSINESS_NOT_FOUND");
      return;
    }

    await prisma.businessUpdateRequest.update({
      where: { id: update.id },
      data: {
        status: "rejected",
        reviewNote: parsed.data.reason ?? null,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    await createNotificationEvent({
      targetUserId: business.userId,
      actorUserId: req.user!.id,
      businessId: update.businessId,
      type: notificationType.REJECTED,
      message: "Your profile updates were rejected.",
      payload: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
    });

    sendSuccess(res, { updateId: update.id, status: "rejected" });
  })
);

export default router;
