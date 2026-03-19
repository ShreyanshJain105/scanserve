import express from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireApprovedBusiness, resolveBusinessForUser } from "../middleware/businessApproval";

const router: express.Router = express.Router();

const profileCreateSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  address: z.string().min(5),
  phone: z.string().min(6).max(32),
});

const profileUpdateSchema = z.object({
  businessId: z.string().optional(),
  name: z.string().min(2).optional(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  address: z.string().min(5).optional(),
  phone: z.string().min(6).max(32).optional(),
});

const qrRotateSchema = z.object({
  reason: z.string().max(250).optional(),
});

const qrRotationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

type RawBusiness = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  address: string;
  phone: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
  rejections?: { id: string; reason: string | null; createdAt: Date }[];
};

type SerializedBusiness = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  address: string;
  phone: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  rejections?: { id: string; reason: string | null; createdAt: string }[];
};

const serializeBusiness = (business: RawBusiness): SerializedBusiness => {
  const serialized: SerializedBusiness = {
    id: business.id,
    userId: business.userId,
    name: business.name,
    slug: business.slug,
    description: business.description,
    logoUrl: business.logoUrl,
    address: business.address,
    phone: business.phone,
    status: business.status,
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

router.use(requireAuth, requireRole("business"));

router.post(
  "/profile",
  asyncHandler(async (req, res) => {
    const parsed = profileCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    try {
      const created = await prisma.business.create({
        data: {
          userId: req.user!.id,
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description ?? null,
          logoUrl: parsed.data.logoUrl ?? null,
          address: parsed.data.address,
          phone: parsed.data.phone,
          status: "pending",
        },
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
    const businesses = await prisma.business.findMany({
      where: { userId: req.user!.id },
      include: {
        rejections: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    sendSuccess(res, {
      businesses: businesses.map((business: RawBusiness) => serializeBusiness(business)),
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

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
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

    const data = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(business.status === "rejected" ? { status: "pending" as const } : {}),
    };

    if (Object.keys(data).length === 0) {
      sendError(res, "No fields provided for update", 400, "VALIDATION_ERROR");
      return;
    }

    try {
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

// Layer 4+ entry points (guarded now to enforce onboarding policy early).
router.get(
  "/menu",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { items: [], businessId: req.business!.id });
  })
);

router.get(
  "/tables",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { tables: [], businessId: req.business!.id });
  })
);

router.post(
  "/tables/:tableId/qr/regenerate",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
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
  "/orders",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { orders: [], businessId: req.business!.id });
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
