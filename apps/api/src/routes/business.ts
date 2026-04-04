import express from "express";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { DIETARY_TAGS, ORDER_STATUS_FLOW } from "@scan2serve/shared";
import type { OrderStatus } from "@scan2serve/shared";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";
import { logger } from "../utils/logger";
import { createZipBuffer } from "../utils/simpleZip";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireApprovedBusiness, resolveBusinessForUser } from "../middleware/businessApproval";
import { suggestCategories } from "../services/menuSuggestions";
import { getMenuItemSuggestions } from "../services/llmMenuSuggestions";
import { generateMenuItemImage } from "../services/aiImageProvider";
import { checkGenerationInputSafety } from "../services/aiGuardrails";
import {
  extractImagePathFromUrl,
  resolveImageUrl,
  uploadImageObject,
} from "../services/objectStorage";
import {
  enqueueDeletedBusinessLogo,
  enqueueDeletedMenuItemImage,
} from "../services/deletedAssetCleanup";
import { fetchOrderSnapshot, publishOrderEventBestEffort } from "../services/orderEvents";

const notifyAdmins = async (params: {
  businessId: string;
  type: string;
  message: string;
  payload?: Prisma.JsonValue;
  actorUserId?: string | null;
}) => {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });
  await Promise.all(
    admins.map(async (admin) => {
      const event = await prisma.notificationEvent.create({
        data: {
          userId: admin.id,
          actorUserId: params.actorUserId ?? null,
          businessId: params.businessId,
          type: params.type,
          message: params.message,
          payload: params.payload,
        },
      });
      await prisma.notificationInbox.create({
        data: {
          userId: admin.id,
          eventId: event.id,
        },
      });
    })
  );
};

const router: express.Router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MENU_IMAGE_MAX_BYTES || 5 * 1024 * 1024) },
});
const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const uploadBusinessLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.BUSINESS_LOGO_MAX_BYTES || 3 * 1024 * 1024) },
});
const uploadImageMiddleware: express.RequestHandler = (req, res, next) => {
  // Enables route tests to inject req.file directly while keeping multipart parsing in runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((req as any).file) {
    next();
    return;
  }
  upload.single("image")(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      sendError(res, "Image file is too large", 400, "IMAGE_FILE_TOO_LARGE");
      return;
    }
    sendError(res, "Invalid image upload request", 400, "IMAGE_UPLOAD_INVALID");
  });
};
const uploadBusinessLogoMiddleware: express.RequestHandler = (req, res, next) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((req as any).file) {
    next();
    return;
  }
  uploadBusinessLogo.single("logo")(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      sendError(res, "Logo image is too large", 400, "IMAGE_FILE_TOO_LARGE");
      return;
    }
    sendError(res, "Invalid logo upload request", 400, "IMAGE_UPLOAD_INVALID");
  });
};

const profileCreateSchema = z.object({
  name: z.string().min(2),
  currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/),
  countryCode: z.string().trim().min(2).max(2),
  timezone: z.string().trim().min(3).max(64),
  description: z.string().max(2000).optional().nullable(),
  address: z.string().min(5),
  phone: z.string().min(6).max(32),
});

const profileUpdateSchema = z.object({
  businessId: z.string().optional(),
  name: z.string().min(2).optional(),
  currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  countryCode: z.string().trim().min(2).max(2).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  description: z.string().max(2000).optional().nullable(),
  address: z.string().min(5).optional(),
  phone: z.string().min(6).max(32).optional(),
});
const profileArchiveSchema = z.object({
  businessId: z.string().min(1),
});
const profileRestoreSchema = z.object({
  businessId: z.string().min(1),
});

const qrRotateSchema = z.object({
  reason: z.string().max(250).optional(),
});

const qrRotationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
const tableListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeInactive: z.coerce.boolean().optional().default(true),
});
const tableBulkCreateSchema = z.object({
  count: z.coerce.number().int().min(1).max(200),
  startFrom: z.coerce.number().int().min(1).optional(),
  labelPrefix: z.string().trim().min(1).max(40).optional(),
});
const tablePatchSchema = z.object({
  label: z.string().trim().min(1).max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});
const qrDownloadQuerySchema = z.object({
  format: z.enum(["png", "svg"]).default("png"),
});
const qrBatchDownloadSchema = z.object({
  tableIds: z.array(z.string().min(1)).max(500).optional(),
  format: z.enum(["png", "svg"]).default("png"),
});
const categoryCreateSchema = z.object({
  name: z.string().min(2).max(80),
});
const categoryUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
const categoryReorderSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string().min(1),
      sortOrder: z.number().int().min(0),
    })
  ).min(1),
});
const menuItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Price must be a decimal string"),
  dietaryTags: z.array(z.enum(DIETARY_TAGS)).optional(),
  isAvailable: z.boolean().optional(),
});
const menuItemUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Price must be a decimal string").optional(),
  dietaryTags: z.array(z.enum(DIETARY_TAGS)).optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
const menuItemReorderSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string().min(1),
      sortOrder: z.number().int().min(0),
    })
  ).min(1),
});
const menuItemAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});
const menuItemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().min(1).optional(),
});
const menuItemSuggestionQuerySchema = z.object({
  categoryId: z.string().min(1),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const orgInviteCheckSchema = z.object({
  email: z.string().email(),
});
const orgInviteCreateSchema = z.object({
  email: z.string().email(),
});
const orgInviteActionSchema = z.object({
  inviteId: z.string().min(1),
});
const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
const businessMembershipCreateSchema = z.object({
  businessId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["manager", "staff"]),
});
const businessMembershipRemoveSchema = z.object({
  businessId: z.string().min(1),
  userId: z.string().min(1),
});
const businessMembershipListSchema = z.object({
  businessId: z.string().min(1),
});
const orderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);
const orderListQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  date: z.enum(["today", "yesterday", "all"]).optional(),
  tzOffset: z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  }, z.number().int().optional()),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});
const resolveDateWindow = (date: "today" | "yesterday", tzOffsetMinutes: number) => {
  const now = new Date();
  const offsetMs = tzOffsetMinutes * 60_000;
  const localNow = new Date(now.getTime() - offsetMs);
  const localStartUtc = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const startUtc = new Date(localStartUtc + offsetMs);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  if (date === "today") {
    return { start: startUtc, end: endUtc };
  }
  const yesterdayStart = new Date(startUtc.getTime() - 24 * 60 * 60 * 1000);
  return { start: yesterdayStart, end: startUtc };
};
const orderStatusUpdateSchema = z.object({
  status: orderStatusSchema,
});
const generateItemImageSchema = z.object({
  prompt: z.string().min(4).max(500).optional(),
});
const businessArchiveRetentionDays = Math.max(
  1,
  Number(process.env.BUSINESS_ARCHIVE_RETENTION_DAYS || 30)
);

type RawBusiness = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  currencyCode: string;
  countryCode: string | null;
  timezone: string;
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

type SerializedBusiness = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  currencyCode: string;
  countryCode: string | null;
  timezone: string;
  description: string | null;
  logoUrl: string | null;
  address: string;
  phone: string;
  status: "pending" | "approved" | "rejected" | "archived";
  blocked: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rejections?: { id: string; reason: string | null; createdAt: string }[];
  businessRole?: "owner" | "manager" | "staff" | null;
};

const serializeBusiness = (business: RawBusiness): SerializedBusiness => {
  const serialized: SerializedBusiness = {
    id: business.id,
    userId: business.userId,
    name: business.name,
    slug: business.slug,
    currencyCode: business.currencyCode,
    countryCode: business.countryCode ?? null,
    timezone: business.timezone,
    description: business.description,
    logoUrl: business.logoUrl,
    address: business.address,
    phone: business.phone,
    status: business.status,
    blocked: business.blocked,
    archivedAt: business.archivedAt ? business.archivedAt.toISOString() : null,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
  };

  if (business.rejections) {
    serialized.rejections = business.rejections.map((item) => ({
      id: item.id,
      reason: item.reason,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  return serialized;
};

const normalizeCurrencyCode = (value: string) => value.trim().toUpperCase();

const slugifyBusinessName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64) || "business";

const generateUniqueBusinessSlug = async (name: string) => {
  const base = slugifyBusinessName(name);
  for (let idx = 0; idx < 10_000; idx += 1) {
    const suffix = idx === 0 ? "" : `-${idx + 1}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    const existing = await prisma.business.findFirst({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base.slice(0, 58)}-${Date.now().toString().slice(-5)}`;
};

const sanitizeFilename = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const getExtensionForMimeType = (mimeType: string) => {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
};

const buildObjectPath = ({
  businessId,
  itemId,
  filename,
}: {
  businessId: string;
  itemId: string;
  filename: string;
}) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = sanitizeFilename(filename) || "image";
  return `business/${businessId}/menu-items/${itemId}/${stamp}-${safeName}`;
};

const buildBusinessLogoObjectPath = ({
  businessId,
  filename,
}: {
  businessId: string;
  filename: string;
}) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = sanitizeFilename(filename) || "logo";
  return `business/${businessId}/profile/logo/${stamp}-${safeName}`;
};

const serializeMenuItem = (item: {
  id: string;
  categoryId: string;
  businessId: string;
  name: string;
  description: string | null;
  price: { toString(): string } | string;
  imagePath: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
  sortOrder: number;
}) => ({
  ...item,
  price: typeof item.price === "string" ? item.price : item.price.toString(),
  imagePath: item.imagePath,
  imageUrl: resolveImageUrl(item.imagePath),
});

const enqueuePreviousImagePath = async ({
  entityId,
  previousImagePath,
}: {
  entityId: string;
  previousImagePath: string | null;
}) => {
  if (!previousImagePath) return;
  await enqueueDeletedMenuItemImage({
    entityId,
    s3Path: previousImagePath,
  });
};

const enqueuePreviousImagePathBestEffort = async ({
  entityId,
  previousImagePath,
}: {
  entityId: string;
  previousImagePath: string | null;
}) => {
  if (!previousImagePath) return;
  try {
    await enqueuePreviousImagePath({ entityId, previousImagePath });
  } catch (error) {
    logger.warn("cleanup.deleted_assets.enqueue_failed", {
      entityId,
      s3Path: previousImagePath,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

const enqueuePreviousLogoUrlBestEffort = async ({
  entityId,
  previousLogoUrl,
}: {
  entityId: string;
  previousLogoUrl: string | null;
}) => {
  const logoPath = extractImagePathFromUrl(previousLogoUrl);
  if (!logoPath) return;
  try {
    await enqueueDeletedBusinessLogo({
      entityId,
      s3Path: logoPath,
    });
  } catch (error) {
    logger.warn("cleanup.deleted_assets.enqueue_failed", {
      entityId,
      s3Path: logoPath,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (error as any).code === "P2002";

const generateQrToken = () => crypto.randomBytes(16).toString("hex");
const qrOldTokenGraceSec = Math.max(
  0,
  Number(process.env.QR_OLD_TOKEN_GRACE_SEC || 0)
);

const getPublicBaseUrl = () => (process.env.CLIENT_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");

const buildQrPayloadUrl = ({
  businessSlug,
  tableNumber,
  token,
}: {
  businessSlug: string;
  tableNumber: number;
  token: string;
}) =>
  `${getPublicBaseUrl()}/menu/${encodeURIComponent(businessSlug)}?table=${tableNumber}&token=${encodeURIComponent(token)}`;

const renderQrAsset = async ({
  payloadUrl,
  format,
}: {
  payloadUrl: string;
  format: "png" | "svg";
}): Promise<Buffer> => {
  if (format === "svg") {
    const svg = await QRCode.toString(payloadUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
    });
    return Buffer.from(svg, "utf8");
  }

  return QRCode.toBuffer(payloadUrl, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
};

const serializeTableRow = (table: {
  id: string;
  businessId: string;
  tableNumber: number;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
  qrCode?: {
    id: string;
    uniqueCode: string;
    createdAt: Date;
  } | null;
}) => ({
  id: table.id,
  businessId: table.businessId,
  tableNumber: table.tableNumber,
  label: table.label,
  isActive: table.isActive,
  createdAt: table.createdAt.toISOString(),
  qrCode: table.qrCode
    ? {
        id: table.qrCode.id,
        uniqueCode: table.qrCode.uniqueCode,
        createdAt: table.qrCode.createdAt.toISOString(),
      }
    : null,
});

type SerializedTableInput = Parameters<typeof serializeTableRow>[0];

const serializeOrderSummary = (order: {
  id: string;
  businessId: string;
  tableId: string;
  status: OrderStatus;
  totalAmount: Prisma.Decimal;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentStatus: "pending" | "unpaid" | "paid" | "failed" | "refunded";
  paymentMethod: "razorpay" | "cash";
  customerName: string;
  customerPhone: string | null;
  statusActors?: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  table?: { id: string; tableNumber: number; label: string | null } | null;
}) => ({
  id: order.id,
  businessId: order.businessId,
  tableId: order.tableId,
  status: order.status,
  totalAmount: order.totalAmount.toString(),
  razorpayOrderId: order.razorpayOrderId,
  razorpayPaymentId: order.razorpayPaymentId,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  statusActors:
    order.statusActors && typeof order.statusActors === "object" && !Array.isArray(order.statusActors)
      ? (order.statusActors as Record<string, string>)
      : null,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  table: order.table
    ? {
        id: order.table.id,
        tableNumber: order.table.tableNumber,
        label: order.table.label,
      }
    : null,
});

const serializeOrderDetail = (order: {
  id: string;
  businessId: string;
  tableId: string;
  status: OrderStatus;
  totalAmount: Prisma.Decimal;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentStatus: "pending" | "unpaid" | "paid" | "failed" | "refunded";
  paymentMethod: "razorpay" | "cash";
  customerName: string;
  customerPhone: string | null;
  statusActors?: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  table?: { id: string; tableNumber: number; label: string | null } | null;
  items?: Array<{
    id: string;
    menuItemId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    specialInstructions: string | null;
    menuItem?: { name: string } | null;
  }>;
}) => ({
  ...serializeOrderSummary(order),
  items: (order.items ?? []).map((item) => ({
    id: item.id,
    menuItemId: item.menuItemId,
    name: item.menuItem?.name ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
    specialInstructions: item.specialInstructions,
  })),
});

const isValidOrderStatusTransition = (current: OrderStatus, next: OrderStatus) => {
  if (current === next) return false;
  if (current === "cancelled" || current === "completed") return false;
  if (next === "cancelled") {
    return current === "pending" || current === "confirmed";
  }
  return ORDER_STATUS_FLOW[current] === next;
};

const resolveStatusActorKey = (status: OrderStatus) => {
  switch (status) {
    case "confirmed":
      return "confirmedBy";
    case "preparing":
      return "preparingBy";
    case "ready":
      return "readyBy";
    case "completed":
      return "completedBy";
    case "cancelled":
      return "cancelledBy";
    default:
      return null;
  }
};

const resolveStatusActorLabel = (req: express.Request) =>
  req.user?.name ?? req.user?.email ?? "Unknown";

const notifyUser = async (params: {
  userId: string;
  type: string;
  message: string;
  payload?: Prisma.JsonValue;
  actorUserId?: string | null;
  businessId?: string | null;
}) => {
  const event = await prisma.notificationEvent.create({
    data: {
      userId: params.userId,
      actorUserId: params.actorUserId ?? null,
      businessId: params.businessId ?? null,
      type: params.type,
      message: params.message,
      payload: params.payload,
    },
  });
  await prisma.notificationInbox.create({
    data: { userId: params.userId, eventId: event.id },
  });
};

const getOrgMembershipForUser = async (userId: string) =>
  prisma.orgMembership.findFirst({
    where: { userId },
    include: { org: true },
  });

const requireOrgMembership = async (req: express.Request, res: express.Response) => {
  const membership = await getOrgMembershipForUser(req.user!.id);
  if (!membership) {
    sendError(res, "You must belong to an org to continue", 403, "ORG_MEMBERSHIP_REQUIRED");
    return null;
  }
  return membership;
};

const isOrgOwner = (membership: Awaited<ReturnType<typeof getOrgMembershipForUser>>, userId: string) =>
  Boolean(membership?.org?.ownerUserId && membership.org.ownerUserId === userId);

const canInviteForOrg = async (
  membership: Awaited<ReturnType<typeof getOrgMembershipForUser>>,
  userId: string
) => {
  if (!membership) return false;
  if (isOrgOwner(membership, userId)) return true;

  const [ownerBusiness, managerMembership] = await Promise.all([
    prisma.business.findFirst({
      where: { orgId: membership.orgId, userId },
      select: { id: true },
    }),
    prisma.businessMembership.findFirst({
      where: {
        userId,
        role: { in: ["owner", "manager"] },
        business: { orgId: membership.orgId },
      },
      select: { id: true },
    }),
  ]);

  return Boolean(ownerBusiness || managerMembership);
};

const requireBusinessAccessManager = async (
  req: express.Request,
  res: express.Response,
  businessId: string
) => {
  const orgMembership = await requireOrgMembership(req, res);
  if (!orgMembership) return null;

  const business = await prisma.business.findFirst({
    where: { id: businessId },
    select: { id: true, orgId: true, userId: true, name: true },
  });
  if (!business || !business.orgId || business.orgId !== orgMembership.orgId) {
    sendError(res, "Business not found for your org", 404, "BUSINESS_NOT_FOUND");
    return null;
  }

  const role = await resolveBusinessRoleForUser(business.id, req.user!.id);
  if (!role || !["owner", "manager"].includes(role)) {
    sendError(res, "You do not have permission for this business action", 403, "BUSINESS_ROLE_FORBIDDEN");
    return null;
  }

  return { orgMembership, business, role };
};

const requireBusinessRole = (
  req: express.Request,
  res: express.Response,
  roles: Array<"owner" | "manager" | "staff">
) => {
  if (!req.businessRole || !roles.includes(req.businessRole)) {
    sendError(res, "You do not have permission for this business action", 403, "BUSINESS_ROLE_FORBIDDEN");
    return false;
  }
  return true;
};

const resolveBusinessRoleForUser = async (
  businessId: string,
  userId: string
): Promise<"owner" | "manager" | "staff" | null> => {
  const membership = await prisma.businessMembership.findFirst({
    where: { businessId, userId },
    select: { role: true },
  });
  if (membership?.role) return membership.role as "owner" | "manager" | "staff";

  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
    select: { id: true },
  });
  if (business) return "owner";

  return null;
};

router.use(requireAuth, requireRole("business"));

router.post(
  "/org",
  asyncHandler(async (req, res) => {
    const parsed = orgCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const existingMembership = await getOrgMembershipForUser(req.user!.id);
    if (existingMembership) {
      sendError(res, "User already belongs to an org", 409, "ORG_ALREADY_JOINED");
      return;
    }

    const org = await prisma.org.create({
      data: {
        ownerUserId: req.user!.id,
        name: parsed.data.name,
      },
    });

    await prisma.orgMembership.create({
      data: {
        orgId: org.id,
        userId: req.user!.id,
      },
    });

    sendSuccess(res, {
      org: {
        id: org.id,
        ownerUserId: org.ownerUserId,
        name: org.name ?? null,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
    });
  })
);

router.post(
  "/profile",
  asyncHandler(async (req, res) => {
    if (req.body && typeof req.body === "object" && "slug" in req.body) {
      sendError(res, "Slug is auto-generated from business name", 400, "SLUG_AUTO_GENERATED");
      return;
    }
    const parsed = profileCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const slug = await generateUniqueBusinessSlug(parsed.data.name);
    const existingMembership = await getOrgMembershipForUser(req.user!.id);
    if (existingMembership && !isOrgOwner(existingMembership, req.user!.id)) {
      sendError(res, "Only org owners can create businesses", 403, "ORG_ROLE_FORBIDDEN");
      return;
    }

    try {
      let orgId = existingMembership?.orgId ?? null;
      if (!orgId) {
        const org = await prisma.org.create({
          data: {
            ownerUserId: req.user!.id,
            name: parsed.data.name,
          },
        });
        await prisma.orgMembership.create({
          data: {
            orgId: org.id,
            userId: req.user!.id,
          },
        });
        orgId = org.id;
      }

      const created = await prisma.business.create({
        data: {
          userId: req.user!.id,
          orgId,
          name: parsed.data.name,
          slug,
          currencyCode: normalizeCurrencyCode(parsed.data.currencyCode),
          countryCode: parsed.data.countryCode.toUpperCase(),
          timezone: parsed.data.timezone,
          description: parsed.data.description ?? null,
          logoUrl: null,
          address: parsed.data.address,
          phone: parsed.data.phone,
          status: "pending",
        },
      });

      await prisma.businessMembership.create({
        data: {
          businessId: created.id,
          userId: req.user!.id,
          role: "owner",
        },
      });

      await notifyAdmins({
        businessId: created.id,
        type: "BUSINESS_SUBMITTED",
        message: `New business submitted: ${created.name}`,
        actorUserId: req.user!.id,
      });

      sendSuccess(res, { business: serializeBusiness(created as RawBusiness) }, 201);
      return;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(res, "Business profile already exists", 409, "BUSINESS_PROFILE_EXISTS");
        return;
      }
      throw error;
    }
  })
);

router.get(
  "/profiles",
  asyncHandler(async (req, res) => {
    const orgMembership = await getOrgMembershipForUser(req.user!.id);
    let businesses: RawBusiness[] = [];

    if (orgMembership && isOrgOwner(orgMembership, req.user!.id)) {
      businesses = await prisma.business.findMany({
        where: { orgId: orgMembership.orgId },
        include: {
          rejections: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    } else {
      const memberships = await prisma.businessMembership.findMany({
        where: { userId: req.user!.id },
        include: {
          business: {
            include: {
              rejections: {
                orderBy: { createdAt: "desc" },
                take: 3,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      businesses = memberships.map((membership) => membership.business as RawBusiness);
    }

    if (businesses.length === 0) {
      businesses = await prisma.business.findMany({
        where: { userId: req.user!.id },
        include: {
          rejections: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    const membershipRows = await prisma.businessMembership.findMany({
      where: { userId: req.user!.id },
      select: { businessId: true, role: true },
    });
    const membershipMap = new Map(
      membershipRows.map((row) => [row.businessId, row.role as "owner" | "manager" | "staff"])
    );

    sendSuccess(res, {
      businesses: businesses.map((business: RawBusiness) => {
        const role =
          membershipMap.get(business.id) ??
          (business.userId === req.user!.id ? "owner" : null);
        return { ...serializeBusiness(business), businessRole: role };
      }),
    });
  })
);

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const business = await resolveBusinessForUser(req);
    if (!business) {
      sendError(res, "Business profile not found", 404, "BUSINESS_PROFILE_REQUIRED");
      return;
    }

    const withRejections = await prisma.business.findUnique({
      where: { id: business.id },
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    sendSuccess(res, {
      business: serializeBusiness((withRejections ?? business) as RawBusiness),
    });
  })
);

router.get(
  "/org/membership",
  asyncHandler(async (req, res) => {
    const membership = await getOrgMembershipForUser(req.user!.id);

    if (!membership) {
      sendSuccess(res, { membership: null });
      return;
    }

    sendSuccess(res, {
      membership: {
        id: membership.id,
        orgId: membership.orgId,
        orgName: membership.org?.name ?? null,
        isOwner: isOrgOwner(membership, req.user!.id),
      },
    });
  })
);

router.get(
  "/org/members",
  asyncHandler(async (req, res) => {
    const membership = await requireOrgMembership(req, res);
    if (!membership) return;
    const canInvite = await canInviteForOrg(membership, req.user!.id);
    if (!canInvite) {
      sendError(res, "You do not have permission for this org action", 403, "ORG_ROLE_FORBIDDEN");
      return;
    }

    const members = await prisma.orgMembership.findMany({
      where: { orgId: membership.orgId },
      include: {
        user: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    sendSuccess(res, {
      members: members.map((member) => ({
        userId: member.userId,
        email: member.user.email,
        isOwner: Boolean(membership.org?.ownerUserId === member.userId),
      })),
    });
  })
);

router.get(
  "/org/invites/check",
  asyncHandler(async (req, res) => {
    const parsed = orgInviteCheckSchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const membership = await requireOrgMembership(req, res);
    if (!membership) return;
    const canInvite = await canInviteForOrg(membership, req.user!.id);
    if (!canInvite) {
      sendError(res, "You do not have permission for this org action", 403, "ORG_ROLE_FORBIDDEN");
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true },
    });

    sendSuccess(res, { exists: Boolean(existingUser) });
  })
);

router.post(
  "/org/invites",
  asyncHandler(async (req, res) => {
    const parsed = orgInviteCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const membership = await requireOrgMembership(req, res);
    if (!membership) return;
    const canInvite = await canInviteForOrg(membership, req.user!.id);
    if (!canInvite) {
      sendError(res, "You do not have permission for this org action", 403, "ORG_ROLE_FORBIDDEN");
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, email: true },
    });
    if (!targetUser) {
      sendError(res, "User does not exist", 404, "USER_NOT_FOUND");
      return;
    }

    const existingOrgMembership = await prisma.orgMembership.findFirst({
      where: { userId: targetUser.id },
    });
    if (existingOrgMembership) {
      sendError(res, "User already belongs to an org", 409, "ORG_ALREADY_JOINED");
      return;
    }

    const existingInvite = await prisma.orgInvite.findFirst({
      where: { orgId: membership.orgId, userId: targetUser.id, status: "pending" },
    });
    if (existingInvite) {
      sendError(res, "Invite already pending", 409, "ORG_INVITE_EXISTS");
      return;
    }

    const invite = await prisma.orgInvite.create({
      data: {
        orgId: membership.orgId,
        userId: targetUser.id,
        status: "pending",
      },
    });

    await notifyUser({
      userId: targetUser.id,
      actorUserId: req.user!.id,
      type: "ORG_INVITE_RECEIVED",
      message: "You have been invited to join an org.",
      payload: { inviteId: invite.id },
    });

    sendSuccess(res, { inviteId: invite.id });
  })
);

router.post(
  "/org/invites/:id/accept",
  asyncHandler(async (req, res) => {
    const parsed = orgInviteActionSchema.safeParse({ inviteId: req.params.id });
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const invite = await prisma.orgInvite.findFirst({
      where: { id: parsed.data.inviteId, userId: req.user!.id },
    });
    if (!invite) {
      sendError(res, "Invite not found", 404, "ORG_INVITE_NOT_FOUND");
      return;
    }
    if (invite.status !== "pending") {
      sendError(res, "Invite already handled", 409, "ORG_INVITE_ALREADY_HANDLED");
      return;
    }

    const existingMembership = await prisma.orgMembership.findFirst({
      where: { userId: req.user!.id },
    });
    if (existingMembership) {
      sendError(res, "You already belong to an org", 409, "ORG_ALREADY_JOINED");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.orgMembership.create({
        data: {
          orgId: invite.orgId,
          userId: req.user!.id,
        },
      });
      await tx.orgInvite.update({
        where: { id: invite.id },
        data: { status: "accepted", respondedAt: new Date() },
      });
    });

    const org = await prisma.org.findUnique({
      where: { id: invite.orgId },
      select: { ownerUserId: true },
    });
    const businessOwners = await prisma.business.findMany({
      where: { orgId: invite.orgId },
      select: { userId: true },
    });
    const businessManagers = await prisma.businessMembership.findMany({
      where: { role: { in: ["owner", "manager"] }, business: { orgId: invite.orgId } },
      select: { userId: true },
    });
    const notifyTargets = new Set<string>();
    if (org?.ownerUserId) notifyTargets.add(org.ownerUserId);
    businessOwners.forEach((entry) => notifyTargets.add(entry.userId));
    businessManagers.forEach((entry) => notifyTargets.add(entry.userId));
    await Promise.all(
      Array.from(notifyTargets).map((userId) =>
        notifyUser({
          userId,
          actorUserId: req.user!.id,
          type: "ORG_INVITE_ACCEPTED",
          message: "An org invite was accepted.",
          payload: { inviteId: invite.id },
        })
      )
    );

    sendSuccess(res, { accepted: true });
  })
);

router.post(
  "/org/invites/:id/decline",
  asyncHandler(async (req, res) => {
    const parsed = orgInviteActionSchema.safeParse({ inviteId: req.params.id });
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const invite = await prisma.orgInvite.findFirst({
      where: { id: parsed.data.inviteId, userId: req.user!.id },
    });
    if (!invite) {
      sendError(res, "Invite not found", 404, "ORG_INVITE_NOT_FOUND");
      return;
    }
    if (invite.status !== "pending") {
      sendError(res, "Invite already handled", 409, "ORG_INVITE_ALREADY_HANDLED");
      return;
    }

    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { status: "declined", respondedAt: new Date() },
    });

    const org = await prisma.org.findUnique({
      where: { id: invite.orgId },
      select: { ownerUserId: true },
    });
    const businessOwners = await prisma.business.findMany({
      where: { orgId: invite.orgId },
      select: { userId: true },
    });
    const businessManagers = await prisma.businessMembership.findMany({
      where: { role: { in: ["owner", "manager"] }, business: { orgId: invite.orgId } },
      select: { userId: true },
    });
    const notifyTargets = new Set<string>();
    if (org?.ownerUserId) notifyTargets.add(org.ownerUserId);
    businessOwners.forEach((entry) => notifyTargets.add(entry.userId));
    businessManagers.forEach((entry) => notifyTargets.add(entry.userId));
    await Promise.all(
      Array.from(notifyTargets).map((userId) =>
        notifyUser({
          userId,
          actorUserId: req.user!.id,
          type: "ORG_INVITE_DECLINED",
          message: "An org invite was declined.",
          payload: { inviteId: invite.id },
        })
      )
    );

    sendSuccess(res, { declined: true });
  })
);

router.post(
  "/org/leave",
  asyncHandler(async (req, res) => {
    const membership = await getOrgMembershipForUser(req.user!.id);
    if (!membership) {
      sendError(res, "You are not part of an org", 404, "ORG_MEMBERSHIP_REQUIRED");
      return;
    }
    if (isOrgOwner(membership, req.user!.id)) {
      sendError(res, "Owners cannot leave the org", 403, "ORG_OWNER_CANNOT_LEAVE");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.businessMembership.deleteMany({
        where: { userId: req.user!.id },
      });
      await tx.orgMembership.delete({ where: { id: membership.id } });
    });

    sendSuccess(res, { left: true });
  })
);

router.get(
  "/memberships",
  asyncHandler(async (req, res) => {
    const parsed = businessMembershipListSchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const access = await requireBusinessAccessManager(req, res, parsed.data.businessId);
    if (!access) return;
    const { business } = access;

    const members = await prisma.businessMembership.findMany({
      where: { businessId: business.id },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    const payload = members.map((member) => ({
      businessId: business.id,
      userId: member.userId,
      email: member.user.email,
      role: member.role,
    }));

    const owner = await prisma.user.findUnique({
      where: { id: business.userId },
      select: { id: true, email: true },
    });
    if (owner) {
      const existing = payload.find((member) => member.userId === owner.id);
      if (existing) {
        existing.role = "owner";
      } else {
        payload.unshift({
          businessId: business.id,
          userId: owner.id,
          email: owner.email,
          role: "owner",
        });
      }
    }

    sendSuccess(res, { members: payload });
  })
);

router.post(
  "/memberships",
  asyncHandler(async (req, res) => {
    const parsed = businessMembershipCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const access = await requireBusinessAccessManager(req, res, parsed.data.businessId);
    if (!access) return;
    const { business, role, orgMembership } = access;

    if (role === "manager" && parsed.data.role !== "staff") {
      sendError(res, "Managers can only add staff", 403, "BUSINESS_ROLE_FORBIDDEN");
      return;
    }

    const targetOrgMembership = await prisma.orgMembership.findFirst({
      where: { userId: parsed.data.userId, orgId: orgMembership.orgId },
    });
    if (!targetOrgMembership) {
      sendError(res, "User is not part of your org", 409, "USER_NOT_IN_ORG");
      return;
    }

    const existing = await prisma.businessMembership.findFirst({
      where: { businessId: business.id, userId: parsed.data.userId },
    });
    if (existing) {
      sendError(res, "User already has access to this business", 409, "BUSINESS_MEMBERSHIP_EXISTS");
      return;
    }

    await prisma.businessMembership.create({
      data: {
        businessId: business.id,
        userId: parsed.data.userId,
        role: parsed.data.role,
      },
    });

    await notifyUser({
      userId: parsed.data.userId,
      actorUserId: req.user!.id,
      type: "BUSINESS_ACCESS_GRANTED",
      message: `You were added to ${business.name}.`,
      payload: { businessId: business.id, role: parsed.data.role },
      businessId: business.id,
    });

    sendSuccess(res, { added: true });
  })
);

router.delete(
  "/memberships",
  asyncHandler(async (req, res) => {
    const parsed = businessMembershipRemoveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const access = await requireBusinessAccessManager(req, res, parsed.data.businessId);
    if (!access) return;
    const { business, role } = access;

    if (business.userId === parsed.data.userId) {
      sendError(res, "Business owner access cannot be removed", 403, "BUSINESS_ROLE_FORBIDDEN");
      return;
    }

    const existing = await prisma.businessMembership.findFirst({
      where: { businessId: business.id, userId: parsed.data.userId },
    });
    if (!existing) {
      sendError(res, "Business membership not found", 404, "BUSINESS_MEMBERSHIP_NOT_FOUND");
      return;
    }

    if (role === "manager" && existing.role !== "staff") {
      sendError(res, "Managers can only remove staff", 403, "BUSINESS_ROLE_FORBIDDEN");
      return;
    }

    await prisma.businessMembership.delete({
      where: { id: existing.id },
    });

    sendSuccess(res, { removed: true });
  })
);

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
            include: {
              business: { select: { id: true, name: true } },
            },
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
      notifications: events.map((event: (typeof events)[number]) => serializeNotification(event, null)),
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

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    if (req.body && typeof req.body === "object" && "slug" in req.body) {
      sendError(res, "Slug cannot be modified", 400, "SLUG_IMMUTABLE");
      return;
    }
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const business = parsed.data.businessId
      ? await prisma.business.findFirst({
          where: { id: parsed.data.businessId, userId: req.user!.id },
        })
      : await resolveBusinessForUser(req);

    if (!business) {
      sendError(res, "Business profile not found", 404, "BUSINESS_PROFILE_REQUIRED");
      return;
    }

    const role = await resolveBusinessRoleForUser(business.id, req.user!.id);
    if (role !== "owner") {
      sendError(res, "Only owners can edit business profiles", 403, "BUSINESS_ROLE_FORBIDDEN");
      return;
    }
    if (business.status === "archived") {
      sendError(
        res,
        "Archived business cannot be edited. Restore it first.",
        409,
        "BUSINESS_ARCHIVED"
      );
      return;
    }

    const updatePayload = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.currencyCode !== undefined
        ? { currencyCode: normalizeCurrencyCode(parsed.data.currencyCode) }
        : {}),
      ...(parsed.data.countryCode !== undefined
        ? { countryCode: parsed.data.countryCode.toUpperCase() }
        : {}),
      ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
    };

    if (Object.keys(updatePayload).length === 0) {
      sendError(res, "No fields provided for update", 400, "VALIDATION_ERROR");
      return;
    }

    try {
      if (business.status === "approved") {
        const existingPending = await prisma.businessUpdateRequest.findFirst({
          where: { businessId: business.id, status: "pending" },
        });
        const mergedPayload =
          existingPending && existingPending.payload
            ? { ...(existingPending.payload as Record<string, unknown>), ...updatePayload }
            : updatePayload;

        const request = existingPending
          ? await prisma.businessUpdateRequest.update({
              where: { id: existingPending.id },
              data: { payload: mergedPayload, status: "pending" },
            })
          : await prisma.businessUpdateRequest.create({
              data: {
                businessId: business.id,
                payload: mergedPayload,
              },
            });

        if (!existingPending) {
          await notifyAdmins({
            businessId: business.id,
            type: "BUSINESS_UPDATE_SUBMITTED",
            message: `Business update submitted: ${business.name}`,
            actorUserId: req.user!.id,
          });
        }

        sendSuccess(res, {
          business: serializeBusiness(business as RawBusiness),
          pendingUpdate: {
            id: request.id,
            status: request.status,
            payload: request.payload,
            createdAt: request.createdAt.toISOString(),
            updatedAt: request.updatedAt.toISOString(),
          },
        });
        return;
      }

      const data = {
        ...updatePayload,
        ...(business.status === "rejected" ? { status: "pending" as const } : {}),
      };

      const updated = await prisma.business.update({
        where: { id: business.id },
        data,
        include: {
          rejections: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      });

      sendSuccess(res, { business: serializeBusiness(updated as RawBusiness) });
      return;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(res, "Business profile already exists", 409, "BUSINESS_PROFILE_EXISTS");
        return;
      }
      throw error;
    }
  })
);

router.patch(
  "/profile/archive",
  asyncHandler(async (req, res) => {
    const parsed = profileArchiveSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const business = await prisma.business.findFirst({
      where: { id: parsed.data.businessId, userId: req.user!.id },
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });
    if (!business) {
      sendError(res, "Business profile not found", 404, "BUSINESS_PROFILE_REQUIRED");
      return;
    }

    const role = await resolveBusinessRoleForUser(business.id, req.user!.id);
    if (role !== "owner") {
      sendError(res, "Only owners can archive businesses", 403, "BUSINESS_ROLE_FORBIDDEN");
      return;
    }

    if (business.status === "archived") {
      sendSuccess(res, { business: serializeBusiness(business as RawBusiness) });
      return;
    }

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: {
        archivedPreviousStatus: business.status,
        status: "archived",
        archivedAt: new Date(),
      },
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    sendSuccess(res, { business: serializeBusiness(updated as RawBusiness) });
  })
);

router.patch(
  "/profile/restore",
  asyncHandler(async (req, res) => {
    const parsed = profileRestoreSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const business = await prisma.business.findFirst({
      where: { id: parsed.data.businessId, userId: req.user!.id },
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });
    if (!business) {
      sendError(res, "Business profile not found", 404, "BUSINESS_PROFILE_REQUIRED");
      return;
    }

    const role = await resolveBusinessRoleForUser(business.id, req.user!.id);
    if (role !== "owner") {
      sendError(res, "Only owners can restore businesses", 403, "BUSINESS_ROLE_FORBIDDEN");
      return;
    }

    if (business.status !== "archived") {
      sendError(res, "Only archived businesses can be restored", 409, "BUSINESS_NOT_ARCHIVED");
      return;
    }

    const archivedAt = business.archivedAt;
    if (!archivedAt) {
      sendError(res, "Archived timestamp missing", 409, "BUSINESS_ARCHIVE_INVALID");
      return;
    }
    const maxRestoreAgeMs = businessArchiveRetentionDays * 24 * 60 * 60 * 1000;
    if (Date.now() - archivedAt.getTime() > maxRestoreAgeMs) {
      sendError(
        res,
        "Restore window expired for this archived business",
        409,
        "BUSINESS_ARCHIVE_EXPIRED"
      );
      return;
    }

    const restoredStatus =
      business.archivedPreviousStatus && business.archivedPreviousStatus !== "archived"
        ? business.archivedPreviousStatus
        : "pending";
    const updated = await prisma.business.update({
      where: { id: business.id },
      data: {
        status: restoredStatus,
        archivedAt: null,
        archivedPreviousStatus: null,
      },
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    sendSuccess(res, { business: serializeBusiness(updated as RawBusiness) });
  })
);

router.post(
  "/profile/logo",
  uploadBusinessLogoMiddleware,
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.body?.businessId === "string" && req.body.businessId.trim()
        ? req.body.businessId.trim()
        : undefined;
    const business = businessId
      ? await prisma.business.findFirst({
          where: { id: businessId, userId: req.user!.id },
        })
      : await resolveBusinessForUser(req);

    if (!business) {
      sendError(res, "Business profile not found", 404, "BUSINESS_PROFILE_REQUIRED");
      return;
    }

    const role = await resolveBusinessRoleForUser(business.id, req.user!.id);
    if (role !== "owner") {
      sendError(res, "Only owners can update business logos", 403, "BUSINESS_ROLE_FORBIDDEN");
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, "Logo image is required", 400, "IMAGE_FILE_REQUIRED");
      return;
    }
    if (!allowedImageMimeTypes.has(file.mimetype)) {
      sendError(res, "Unsupported image type", 400, "IMAGE_TYPE_UNSUPPORTED");
      return;
    }

    const extension = getExtensionForMimeType(file.mimetype);
    const objectPath = buildBusinessLogoObjectPath({
      businessId: business.id,
      filename: `${business.name}.${extension}`,
    });

    try {
      const stored = await uploadImageObject({
        objectPath,
        body: file.buffer,
        contentType: file.mimetype,
      });
      const updated = await prisma.business.update({
        where: { id: business.id },
        data: { logoUrl: stored.imageUrl },
        include: {
          rejections: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      });
      await enqueuePreviousLogoUrlBestEffort({
        entityId: business.id,
        previousLogoUrl: business.logoUrl,
      });

      sendSuccess(res, { business: serializeBusiness(updated as RawBusiness) });
    } catch {
      sendError(res, "Image storage failed", 503, "IMAGE_STORAGE_UNAVAILABLE");
      return;
    }
  })
);

router.get(
  "/categories",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const categories = await prisma.category.findMany({
      where: { businessId: req.business!.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    sendSuccess(res, { categories });
  })
);

router.get(
  "/menu-suggestions/categories",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const categories = await prisma.category.findMany({
      where: { businessId: req.business!.id },
      select: { name: true },
    });
    const suggestions = suggestCategories(
      categories.map((category: { name: string }) => category.name)
    );
    sendSuccess(res, { suggestions });
  })
);

router.get(
  "/menu-suggestions/items",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = menuItemSuggestionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const category = await prisma.category.findFirst({
      where: { id: parsed.data.categoryId, businessId: req.business!.id },
      select: { id: true, name: true },
    });
    if (!category) {
      sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
      return;
    }

    const existingItems = await prisma.menuItem.findMany({
      where: { businessId: req.business!.id, categoryId: category.id },
      select: { name: true },
    });

    const suggestions = await getMenuItemSuggestions({
      categoryName: category.name,
      existingItemNames: existingItems.map((item: { name: string }) => item.name),
      typedQuery: parsed.data.q,
      limit: parsed.data.limit ?? 5,
    });
    sendSuccess(res, { suggestions });
  })
);

router.post(
  "/categories",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = categoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const max = await prisma.category.aggregate({
      where: { businessId: req.business!.id },
      _max: { sortOrder: true },
    });
    try {
      const category = await prisma.category.create({
        data: {
          businessId: req.business!.id,
          name: parsed.data.name,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
      });
      sendSuccess(res, { category }, 201);
      return;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(res, "Category name already exists", 409, "CATEGORY_EXISTS");
        return;
      }
      throw error;
    }
  })
);

router.patch(
  "/categories/:id",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = categoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const id = req.params.id;
    const existing = await prisma.category.findFirst({
      where: { id, businessId: req.business!.id },
    });
    if (!existing) {
      sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
      return;
    }
    try {
      const category = await prisma.category.update({
        where: { id: existing.id },
        data: parsed.data,
      });
      sendSuccess(res, { category });
      return;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(res, "Category name already exists", 409, "CATEGORY_EXISTS");
        return;
      }
      throw error;
    }
  })
);

router.post(
  "/categories/reorder",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = categoryReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const orderedCategoryIds = parsed.data.orders.map((item) => item.id);
    if (new Set(orderedCategoryIds).size !== orderedCategoryIds.length) {
      sendError(res, "Duplicate category ids in reorder payload", 400, "VALIDATION_ERROR");
      return;
    }

    await prisma.$transaction(
      orderedCategoryIds.map((id, sortOrder) =>
        prisma.category.updateMany({
          where: { id, businessId: req.business!.id },
          data: { sortOrder },
        })
      )
    );
    sendSuccess(res, { updated: orderedCategoryIds.length });
  })
);

router.delete(
  "/categories/:id",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const id = req.params.id;
    const existing = await prisma.category.findFirst({
      where: { id, businessId: req.business!.id },
    });
    if (!existing) {
      sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
      return;
    }

    const linkedItems = await prisma.menuItem.count({
      where: { categoryId: existing.id, businessId: req.business!.id },
    });
    if (linkedItems > 0) {
      sendError(
        res,
        "Cannot delete non-empty category",
        409,
        "CATEGORY_NOT_EMPTY"
      );
      return;
    }

    await prisma.category.delete({ where: { id: existing.id } });
    sendSuccess(res, { deleted: true });
  })
);

router.get(
  "/menu-items",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = menuItemListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const { page, limit, categoryId } = parsed.data;
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, businessId: req.business!.id },
        select: { id: true },
      });
      if (!category) {
        sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
        return;
      }
    }
    const skip = (page - 1) * limit;
    const where = {
      businessId: req.business!.id,
      ...(categoryId ? { categoryId } : {}),
    };
    const [total, items] = await prisma.$transaction([
      prisma.menuItem.count({ where }),
      prisma.menuItem.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    sendSuccess(res, {
      items: items.map((item: Parameters<typeof serializeMenuItem>[0]) =>
        serializeMenuItem(item)
      ),
      page,
      limit,
      total,
    });
  })
);

router.post(
  "/menu-items",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = menuItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const category = await prisma.category.findFirst({
      where: { id: parsed.data.categoryId, businessId: req.business!.id },
    });
    if (!category) {
      sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
      return;
    }
    const max = await prisma.menuItem.aggregate({
      where: { businessId: req.business!.id },
      _max: { sortOrder: true },
    });
    const item = await prisma.menuItem.create({
      data: {
        businessId: req.business!.id,
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        price: parsed.data.price,
        imagePath: null,
        dietaryTags: parsed.data.dietaryTags ?? [],
        isAvailable: parsed.data.isAvailable ?? true,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    sendSuccess(res, { item: serializeMenuItem(item) }, 201);
  })
);

router.patch(
  "/menu-items/:id",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = menuItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const id = req.params.id;
    const existing = await prisma.menuItem.findFirst({
      where: { id, businessId: req.business!.id },
    });
    if (!existing) {
      sendError(res, "Menu item not found", 404, "MENU_ITEM_NOT_FOUND");
      return;
    }
    if (parsed.data.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: parsed.data.categoryId, businessId: req.business!.id },
      });
      if (!category) {
        sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
        return;
      }
    }
    const item = await prisma.menuItem.update({
      where: { id: existing.id },
      data: parsed.data,
    });
    sendSuccess(res, { item: serializeMenuItem(item) });
  })
);

router.post(
  "/menu-items/reorder",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = menuItemReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const orderedItemIds = parsed.data.orders.map((item) => item.id);
    if (new Set(orderedItemIds).size !== orderedItemIds.length) {
      sendError(res, "Duplicate menu item ids in reorder payload", 400, "VALIDATION_ERROR");
      return;
    }

    await prisma.$transaction(
      orderedItemIds.map((id, sortOrder) =>
        prisma.menuItem.updateMany({
          where: { id, businessId: req.business!.id },
          data: { sortOrder },
        })
      )
    );
    sendSuccess(res, { updated: orderedItemIds.length });
  })
);

router.patch(
  "/menu-items/:id/availability",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = menuItemAvailabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const id = req.params.id;
    const existing = await prisma.menuItem.findFirst({
      where: { id, businessId: req.business!.id },
    });
    if (!existing) {
      sendError(res, "Menu item not found", 404, "MENU_ITEM_NOT_FOUND");
      return;
    }
    const item = await prisma.menuItem.update({
      where: { id: existing.id },
      data: { isAvailable: parsed.data.isAvailable },
    });
    sendSuccess(res, { item: serializeMenuItem(item) });
  })
);

router.post(
  "/menu-items/:id/image/upload",
  requireApprovedBusiness,
  uploadImageMiddleware,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const id = req.params.id;
    const existing = await prisma.menuItem.findFirst({
      where: { id, businessId: req.business!.id },
      include: { category: { select: { name: true } } },
    });
    if (!existing) {
      sendError(res, "Menu item not found", 404, "MENU_ITEM_NOT_FOUND");
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, "Image file is required", 400, "IMAGE_FILE_REQUIRED");
      return;
    }
    if (!allowedImageMimeTypes.has(file.mimetype)) {
      sendError(res, "Unsupported image type", 400, "IMAGE_TYPE_UNSUPPORTED");
      return;
    }

    const extension = getExtensionForMimeType(file.mimetype);
    const objectPath = buildObjectPath({
      businessId: req.business!.id,
      itemId: existing.id,
      filename: `${existing.name}.${extension}`,
    });

    try {
      const stored = await uploadImageObject({
        objectPath,
        body: file.buffer,
        contentType: file.mimetype,
      });
      const item = await prisma.menuItem.update({
        where: { id: existing.id },
        data: { imagePath: stored.imagePath },
      });
      if (existing.imagePath && existing.imagePath !== stored.imagePath) {
        await enqueuePreviousImagePathBestEffort({
          entityId: existing.id,
          previousImagePath: existing.imagePath,
        });
      }
      sendSuccess(res, {
        item: serializeMenuItem(item),
      });
    } catch (error) {
      sendError(res, "Image storage failed", 503, "IMAGE_STORAGE_UNAVAILABLE");
      return;
    }
  })
);

router.post(
  "/menu-items/:id/image/generate",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = generateItemImageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const id = req.params.id;
    const existing = await prisma.menuItem.findFirst({
      where: { id, businessId: req.business!.id },
      include: { category: { select: { name: true } } },
    });
    if (!existing) {
      sendError(res, "Menu item not found", 404, "MENU_ITEM_NOT_FOUND");
      return;
    }

    const prompt =
      parsed.data.prompt?.trim() ||
      `Food product photo of ${existing.name} in ${existing.category.name} style, realistic lighting, high detail`;
    const inputGuard = checkGenerationInputSafety([prompt, existing.name, existing.category.name]);
    if (!inputGuard.safe) {
      logger.warn("ai.guardrail.blocked_input", {
        route: "/api/business/menu-items/:id/image/generate",
        businessId: req.business!.id,
        category: inputGuard.category,
      });
      sendError(res, "Prompt content is not allowed", 400, "AI_PROMPT_UNSAFE");
      return;
    }

    const generated = await generateMenuItemImage({
      prompt,
      itemName: existing.name,
      categoryName: existing.category.name,
    });

    if (!generated) {
      sendError(res, "AI image generation failed", 503, "AI_IMAGE_GENERATION_FAILED");
      return;
    }

    const objectPath = buildObjectPath({
      businessId: req.business!.id,
      itemId: existing.id,
      filename: `${existing.name}.${getExtensionForMimeType(generated.mimeType)}`,
    });

    try {
      const stored = await uploadImageObject({
        objectPath,
        body: generated.buffer,
        contentType: generated.mimeType,
      });
      const item = await prisma.menuItem.update({
        where: { id: existing.id },
        data: { imagePath: stored.imagePath },
      });
      if (existing.imagePath && existing.imagePath !== stored.imagePath) {
        await enqueuePreviousImagePathBestEffort({
          entityId: existing.id,
          previousImagePath: existing.imagePath,
        });
      }
      sendSuccess(res, { item: serializeMenuItem(item) });
    } catch {
      sendError(res, "Image storage failed", 503, "IMAGE_STORAGE_UNAVAILABLE");
      return;
    }
  })
);

router.delete(
  "/menu-items/:id",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const id = req.params.id;
    const existing = await prisma.menuItem.findFirst({
      where: { id, businessId: req.business!.id },
    });
    if (!existing) {
      sendError(res, "Menu item not found", 404, "MENU_ITEM_NOT_FOUND");
      return;
    }
    await prisma.menuItem.delete({ where: { id: existing.id } });
    await enqueuePreviousImagePathBestEffort({
      entityId: existing.id,
      previousImagePath: existing.imagePath,
    });
    sendSuccess(res, { deleted: true });
  })
);

// Layer 4+ entry points (guarded now to enforce onboarding policy early).
router.get(
  "/menu",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    sendSuccess(res, { items: [], businessId: req.business!.id });
  })
);

router.get(
  "/tables",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = tableListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const where = {
      businessId: req.business!.id,
      ...(parsed.data.includeInactive ? {} : { isActive: true }),
    };
    const skip = (parsed.data.page - 1) * parsed.data.limit;
    const [total, rows] = await Promise.all([
      prisma.table.count({ where }),
      prisma.table.findMany({
        where,
        orderBy: { tableNumber: "asc" },
        skip,
        take: parsed.data.limit,
        include: { qrCode: true },
      }),
    ]);

    const qrCodeIds = rows
      .map((row: { qrCode: { id: string } | null }) => row.qrCode?.id || null)
      .filter((id: string | null): id is string => Boolean(id));
    const latestRotations = qrCodeIds.length
      ? await prisma.qrCodeRotation.findMany({
          where: { qrCodeId: { in: qrCodeIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const latestRotationMap = new Map<string, string>();
    for (const rotation of latestRotations) {
      if (latestRotationMap.has(rotation.qrCodeId)) continue;
      latestRotationMap.set(rotation.qrCodeId, rotation.createdAt.toISOString());
    }

    sendSuccess(res, {
      tables: rows.map((row: SerializedTableInput) => ({
        ...serializeTableRow(row),
        lastRotatedAt: row.qrCode ? latestRotationMap.get(row.qrCode.id) || null : null,
      })),
      total,
      page: parsed.data.page,
      limit: parsed.data.limit,
      businessId: req.business!.id,
    });
  })
);

router.post(
  "/tables/bulk",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = tableBulkCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const business = await prisma.business.findFirst({
      where: { id: req.business!.id },
      select: { id: true },
    });
    if (!business) {
      sendError(res, "Business not found", 404, "BUSINESS_NOT_FOUND");
      return;
    }

    const maxExisting = await prisma.table.aggregate({
      where: { businessId: req.business!.id },
      _max: { tableNumber: true },
    });
    const startFrom = parsed.data.startFrom ?? (maxExisting._max.tableNumber ?? 0) + 1;
    const numbers = Array.from({ length: parsed.data.count }, (_, idx) => startFrom + idx);
    const conflicts = await prisma.table.findMany({
      where: {
        businessId: req.business!.id,
        tableNumber: { in: numbers },
      },
      select: { tableNumber: true },
    });
    if (conflicts.length > 0) {
      sendError(res, "Table numbers already exist in requested range", 409, "TABLE_NUMBER_CONFLICT");
      return;
    }

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const out: Array<{
        id: string;
        businessId: string;
        tableNumber: number;
        label: string | null;
        isActive: boolean;
        createdAt: Date;
        qrCode: {
          id: string;
          uniqueCode: string;
          createdAt: Date;
        } | null;
      }> = [];

      for (let idx = 0; idx < parsed.data.count; idx += 1) {
        const tableNumber = startFrom + idx;
        const table = await tx.table.create({
          data: {
            businessId: req.business!.id,
            tableNumber,
            label: parsed.data.labelPrefix ? `${parsed.data.labelPrefix} ${tableNumber}` : null,
          },
        });

        let qrCode: { id: string; uniqueCode: string; createdAt: Date } | null = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            const createdQr = await tx.qrCode.create({
              data: {
                businessId: req.business!.id,
                tableId: table.id,
                uniqueCode: generateQrToken(),
                qrImageUrl: null,
              },
              select: {
                id: true,
                uniqueCode: true,
                createdAt: true,
              },
            });
            qrCode = createdQr;
            break;
          } catch (error) {
            if (!isUniqueConstraintError(error) || attempt === 5) throw error;
          }
        }

        out.push({
          ...table,
          qrCode,
        });
      }
      return out;
    });

    sendSuccess(
      res,
      {
        tables: created.map((row: SerializedTableInput) => ({
          ...serializeTableRow(row),
          lastRotatedAt: null,
        })),
        createdCount: created.length,
      },
      201
    );
  })
);

router.patch(
  "/tables/:tableId",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = tablePatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    if (parsed.data.label === undefined && parsed.data.isActive === undefined) {
      sendError(res, "Nothing to update", 400, "VALIDATION_ERROR");
      return;
    }

    const tableId = req.params.tableId;
    if (!tableId) {
      sendError(res, "Table id is required", 400, "VALIDATION_ERROR");
      return;
    }

    const updated = await prisma.table.updateMany({
      where: { id: tableId, businessId: req.business!.id },
      data: {
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    });

    if (!updated.count) {
      sendError(res, "Table not found for business", 404, "TABLE_NOT_FOUND");
      return;
    }

    const table = await prisma.table.findFirst({
      where: { id: tableId, businessId: req.business!.id },
      include: { qrCode: true },
    });
    if (!table) {
      sendError(res, "Table not found for business", 404, "TABLE_NOT_FOUND");
      return;
    }

    sendSuccess(res, {
      table: {
        ...serializeTableRow(table),
        lastRotatedAt: null,
      },
    });
  })
);

router.post(
  "/tables/:tableId/qr/regenerate",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = qrRotateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const tableId = req.params.tableId;
    if (!tableId) {
      sendError(res, "Table id is required", 400, "VALIDATION_ERROR");
      return;
    }

    const table = await prisma.table.findFirst({
      where: { id: tableId, businessId: req.business!.id },
    });

    if (!table) {
      sendError(res, "Table not found for business", 404, "TABLE_NOT_FOUND");
      return;
    }

    const existingQr = await prisma.qrCode.findUnique({
      where: { tableId: table.id },
    });

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const nextToken = generateQrToken();
      try {
        const qrCode = existingQr
          ? await prisma.qrCode.update({
              where: { id: existingQr.id },
              data: { uniqueCode: nextToken, qrImageUrl: null },
            })
          : await prisma.qrCode.create({
              data: {
                businessId: req.business!.id,
                tableId: table.id,
                uniqueCode: nextToken,
                qrImageUrl: null,
              },
            });

        if (existingQr && existingQr.uniqueCode !== nextToken) {
          const graceExpiresAt =
            qrOldTokenGraceSec > 0
              ? new Date(Date.now() + qrOldTokenGraceSec * 1000)
              : null;
          await prisma.qrCodeRotation.create({
            data: {
              qrCodeId: qrCode.id,
              oldToken: existingQr.uniqueCode,
              newToken: nextToken,
              rotatedByUserId: req.user!.id,
              reason: parsed.data.reason ?? null,
              graceExpiresAt,
            },
          });
        }

        sendSuccess(res, {
          qrCode: {
            id: qrCode.id,
            tableId: qrCode.tableId,
            businessId: qrCode.businessId,
            uniqueCode: qrCode.uniqueCode,
            createdAt: qrCode.createdAt.toISOString(),
          },
          graceExpiresAt:
            qrOldTokenGraceSec > 0
              ? new Date(Date.now() + qrOldTokenGraceSec * 1000).toISOString()
              : null,
        });
        return;
      } catch (error) {
        if (isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    sendError(res, "Failed to rotate QR token", 500, "QR_ROTATION_FAILED");
  })
);

router.get(
  "/tables/:tableId/qr/rotations",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsedQuery = qrRotationListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      sendError(res, parsedQuery.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const limit = parsedQuery.data.limit ?? 20;
    const tableId = req.params.tableId;
    if (!tableId) {
      sendError(res, "Table id is required", 400, "VALIDATION_ERROR");
      return;
    }

    const qrCode = await prisma.qrCode.findFirst({
      where: {
        tableId,
        businessId: req.business!.id,
      },
    });

    if (!qrCode) {
      sendError(res, "QR code not found for table", 404, "QR_CODE_NOT_FOUND");
      return;
    }

    const rows = await prisma.qrCodeRotation.findMany({
      where: { qrCodeId: qrCode.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    sendSuccess(res, {
      rotations: rows.map((row: any) => ({
        id: row.id,
        oldToken: row.oldToken,
        newToken: row.newToken,
        rotatedByUserId: row.rotatedByUserId,
        reason: row.reason,
        graceExpiresAt: row.graceExpiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  })
);

router.get(
  "/tables/:tableId/qr/download",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = qrDownloadQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }
    const tableId = req.params.tableId;
    const table = await prisma.table.findFirst({
      where: { id: tableId, businessId: req.business!.id },
      include: {
        qrCode: true,
        business: { select: { slug: true } },
      },
    });
    if (!table) {
      sendError(res, "Table not found for business", 404, "TABLE_NOT_FOUND");
      return;
    }
    if (!table.qrCode) {
      sendError(res, "QR code not found for table", 404, "QR_CODE_NOT_FOUND");
      return;
    }

    const payloadUrl = buildQrPayloadUrl({
      businessSlug: table.business.slug,
      tableNumber: table.tableNumber,
      token: table.qrCode.uniqueCode,
    });
    const fileData = await renderQrAsset({
      payloadUrl,
      format: parsed.data.format,
    });
    const ext = parsed.data.format === "svg" ? "svg" : "png";

    res.setHeader("Content-Type", parsed.data.format === "svg" ? "image/svg+xml" : "image/png");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"table-${table.tableNumber}-qr.${ext}\"`
    );
    res.status(200).send(fileData);
  })
);

router.post(
  "/tables/qr/download",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager"])) return;
    const parsed = qrBatchDownloadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const tables = await prisma.table.findMany({
      where: {
        businessId: req.business!.id,
        isActive: true,
        ...(parsed.data.tableIds?.length ? { id: { in: parsed.data.tableIds } } : {}),
      },
      orderBy: { tableNumber: "asc" },
      include: {
        qrCode: true,
        business: { select: { slug: true } },
      },
    });

    if (parsed.data.tableIds?.length && tables.length !== parsed.data.tableIds.length) {
      sendError(res, "Some tables were not found for this business", 404, "TABLE_NOT_FOUND");
      return;
    }
    if (!tables.length) {
      sendError(res, "No active tables available for export", 404, "TABLE_NOT_FOUND");
      return;
    }

    const format = parsed.data.format;
    const ext = format === "svg" ? "svg" : "png";
    const files: Array<{ name: string; data: Buffer }> = [];

    for (const table of tables) {
      if (!table.qrCode) continue;
      const payloadUrl = buildQrPayloadUrl({
        businessSlug: table.business.slug,
        tableNumber: table.tableNumber,
        token: table.qrCode.uniqueCode,
      });
      const data = await renderQrAsset({ payloadUrl, format });
      files.push({
        name: `table-${table.tableNumber}-qr.${ext}`,
        data,
      });
    }

    if (!files.length) {
      sendError(res, "QR codes not found for selected tables", 404, "QR_CODE_NOT_FOUND");
      return;
    }

    const zip = createZipBuffer(files);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=\"tables-qr-${ext}.zip\"`);
    res.status(200).send(zip);
  })
);

router.get(
  "/orders",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager", "staff"])) return;
    const parsed = orderListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const where: Prisma.OrderWhereInput = {
      businessId: req.business!.id,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    };
    if (parsed.data.date && parsed.data.date !== "all") {
      const offsetMinutes =
        typeof parsed.data.tzOffset === "number"
          ? parsed.data.tzOffset
          : -new Date().getTimezoneOffset();
      const window = resolveDateWindow(parsed.data.date, offsetMinutes);
      where.updatedAt = { gte: window.start, lt: window.end };
    }

    if (parsed.data.cursor) {
      const cursorOrder = await prisma.order.findFirst({
        where: { id: parsed.data.cursor, businessId: req.business!.id },
        select: { id: true, createdAt: true },
      });
      if (!cursorOrder) {
        sendError(res, "Cursor order not found", 404, "ORDER_CURSOR_NOT_FOUND");
        return;
      }
      where.OR = [
        { createdAt: { lt: cursorOrder.createdAt } },
        { createdAt: cursorOrder.createdAt, id: { lt: cursorOrder.id } },
      ];
    }

    const take = parsed.data.limit + 1;
    const rows = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      include: {
        table: { select: { id: true, tableNumber: true, label: true } },
      },
    });

    const hasMore = rows.length > parsed.data.limit;
    const trimmed = hasMore ? rows.slice(0, parsed.data.limit) : rows;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null;

    sendSuccess(res, {
      orders: trimmed.map((order) => serializeOrderSummary(order)),
      nextCursor,
      hasMore,
      businessId: req.business!.id,
    });
  })
);

router.get(
  "/orders/:id",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager", "staff"])) return;
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, businessId: req.business!.id },
      include: {
        table: { select: { id: true, tableNumber: true, label: true } },
        items: { include: { menuItem: { select: { name: true } } } },
      },
    });
    if (!order) {
      sendError(res, "Order not found", 404, "ORDER_NOT_FOUND");
      return;
    }

    sendSuccess(res, { order: serializeOrderDetail(order) });
  })
);

router.patch(
  "/orders/:id/status",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager", "staff"])) return;
    const parsed = orderStatusUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, businessId: req.business!.id },
    });
    if (!existing) {
      sendError(res, "Order not found", 404, "ORDER_NOT_FOUND");
      return;
    }

    if (!isValidOrderStatusTransition(existing.status as OrderStatus, parsed.data.status)) {
      sendError(res, "Invalid order status transition", 400, "INVALID_ORDER_STATUS_TRANSITION");
      return;
    }
    if (parsed.data.status === "completed" && existing.paymentStatus !== "paid") {
      sendError(res, "Order must be paid before completion", 400, "ORDER_NOT_PAID");
      return;
    }

    const actorKey = resolveStatusActorKey(parsed.data.status);
    const actorLabel = resolveStatusActorLabel(req);
    const currentActors =
      existing.statusActors && typeof existing.statusActors === "object" && !Array.isArray(existing.statusActors)
        ? (existing.statusActors as Record<string, string>)
        : {};

    const updated = await prisma.order.update({
      where: { id_createdAt: { id: existing.id, createdAt: existing.createdAt } },
      data: {
        status: parsed.data.status,
        statusActors: actorKey ? { ...currentActors, [actorKey]: actorLabel } : currentActors,
      },
      include: {
        table: { select: { id: true, tableNumber: true, label: true } },
      },
    });

    const snapshot = await fetchOrderSnapshot(updated.id);
    if (snapshot) {
      await publishOrderEventBestEffort({
        type: "order_status_updated",
        order: snapshot.order,
        items: snapshot.items,
      });
    }

    sendSuccess(res, { order: serializeOrderSummary(updated) });
  })
);

router.patch(
  "/orders/:id/mark-paid",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager", "staff"])) return;
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, businessId: req.business!.id },
    });
    if (!order) {
      sendError(res, "Order not found", 404, "ORDER_NOT_FOUND");
      return;
    }
    if (order.paymentMethod !== "cash") {
      sendError(res, "Order is not a cash payment", 400, "PAYMENT_METHOD_INVALID");
      return;
    }
    if (order.paymentStatus === "paid") {
      sendError(res, "Order already paid", 409, "ORDER_ALREADY_PAID");
      return;
    }

    const updated = await prisma.order.update({
      where: { id_createdAt: { id: order.id, createdAt: order.createdAt } },
      data: { paymentStatus: "paid" },
      include: {
        table: { select: { id: true, tableNumber: true, label: true } },
      },
    });

    const snapshot = await fetchOrderSnapshot(updated.id);
    if (snapshot) {
      await publishOrderEventBestEffort({
        type: "order_payment_updated",
        order: snapshot.order,
        items: snapshot.items,
      });
    }

    sendSuccess(res, { order: serializeOrderSummary(updated) });
  })
);

// Legacy probe used by tests.
router.get(
  "/ops/ping",
  requireApprovedBusiness,
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { ok: true });
  })
);

export default router;
