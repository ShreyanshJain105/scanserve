import express from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";

const router: express.Router = express.Router();

const statusSchema = z.enum(["pending", "approved", "rejected"]);
const rejectSchema = z.object({
  reason: z.string().max(2000).optional().nullable(),
});

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
  status: "pending" | "approved" | "rejected";
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
  createdAt: business.createdAt.toISOString(),
  updatedAt: business.updatedAt.toISOString(),
  rejections: business.rejections?.map((item) => ({
    id: item.id,
    reason: item.reason,
    createdAt: item.createdAt.toISOString(),
  })),
});

router.use(requireAuth, requireRole("admin"));

router.get(
  "/businesses",
  asyncHandler(async (req, res) => {
    const statusQuery = req.query.status;
    let statusFilter: "pending" | "approved" | "rejected" | undefined;

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

    sendSuccess(res, { business: serializeBusiness(updated as RawBusiness) });
  })
);

export default router;
