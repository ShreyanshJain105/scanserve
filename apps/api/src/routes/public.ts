import express from "express";
import { createHmac } from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { resolveImageUrl } from "../services/objectStorage";
import { sendError, sendSuccess } from "../utils/response";
import { fetchOrderSnapshot, publishOrderEventBestEffort } from "../services/orderEvents";
import { isRazorpayConfigured } from "../services/razorpay";
import {
  buildReviewCacheKey,
  getReviewCacheVersion,
  getReviewCache,
  invalidateReviewCacheForBusiness,
  setReviewCache,
} from "../services/reviewCache";
import {
  fetchWarehouseReviewIdsByOrderIds,
  fetchWarehouseReviewSummary,
  fetchWarehouseReviews,
} from "../services/reviewWarehouse";

const router: express.Router = express.Router();

const createOrderSchema = z.object({
  businessId: z.string().min(1),
  tableId: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  paymentMethod: z.enum(["razorpay", "cash"]),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      })
    )
    .min(1),
});

const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const reviewCreateSchema = z.object({
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(250).optional().nullable(),
});

const reviewListQuerySchema = z.object({
  businessId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  scope: z.enum(["recent", "all"]).default("recent"),
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const reviewHotDays = Math.max(1, Number(process.env.REVIEW_HOT_DAYS || 90));

const buildRatingCounts = () => ({
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
} as Record<1 | 2 | 3 | 4 | 5, number>);

const getReviewCutoff = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - reviewHotDays);
  return cutoff;
};

const normalizeCreatedAt = (value: string) => {
  const parsed = new Date(value.includes("T") ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const readCustomerFromRequest = async (req: express.Request) => {
  const token = req.cookies?.qr_customer_access as string | undefined;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    return prisma.customerUser.findUnique({ where: { id: decoded.sub } });
  } catch {
    return null;
  }
};

router.get(
  "/qr/:qrToken",
  asyncHandler(async (req, res) => {
    const qrToken = req.params.qrToken;
    if (!qrToken || qrToken.length < 12) {
      sendError(res, "Invalid QR token", 400, "INVALID_QR_TOKEN");
      return;
    }

    let qrCode = await prisma.qrCode.findUnique({
      where: { uniqueCode: qrToken },
      include: {
        business: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
          },
        },
        table: {
          select: {
            id: true,
            tableNumber: true,
            isActive: true,
          },
        },
      },
    });

    let isGraceToken = false;
    if (!qrCode) {
      const rotation = await prisma.qrCodeRotation.findFirst({
        where: {
          oldToken: qrToken,
          graceExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        include: {
          qrCode: {
            include: {
              business: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  status: true,
                },
              },
              table: {
                select: {
                  id: true,
                  tableNumber: true,
                  isActive: true,
                },
              },
            },
          },
        },
      });
      if (rotation) {
        qrCode = rotation.qrCode;
        isGraceToken = true;
      }
    }

    if (!qrCode) {
      sendError(res, "QR token not found", 404, "QR_NOT_FOUND");
      return;
    }

    if (qrCode.business.status !== "approved") {
      sendError(res, "Business is not available", 403, "BUSINESS_NOT_AVAILABLE");
      return;
    }

    if (!qrCode.table.isActive) {
      sendError(res, "Table is inactive", 403, "TABLE_INACTIVE");
      return;
    }

    sendSuccess(res, {
      qr: {
        token: qrCode.uniqueCode,
        business: {
          id: qrCode.business.id,
          slug: qrCode.business.slug,
          name: qrCode.business.name,
        },
        table: {
          id: qrCode.table.id,
          number: qrCode.table.tableNumber,
        },
        isGraceToken,
      },
    });
  })
);

router.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const customer = await readCustomerFromRequest(req);
    if (!customer) {
      sendError(res, "Customer login required", 401, "CUSTOMER_AUTH_REQUIRED");
      return;
    }
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const { businessId, tableId, customerName, customerPhone, items, paymentMethod } = parsed.data;

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business || business.status !== "approved" || business.archivedAt || business.blocked) {
      sendError(res, "Business is not available", 403, "BUSINESS_NOT_AVAILABLE");
      return;
    }

    const table = await prisma.table.findFirst({
      where: { id: tableId, businessId },
      select: { id: true, isActive: true },
    });
    if (!table || !table.isActive) {
      sendError(res, "Table is inactive", 403, "TABLE_INACTIVE");
      return;
    }

    const normalizedItems = new Map<string, number>();
    for (const entry of items) {
      const current = normalizedItems.get(entry.menuItemId) ?? 0;
      const next = current + entry.quantity;
      if (next > 50) {
        sendError(res, "Quantity too large for an item", 400, "INVALID_QUANTITY");
        return;
      }
      normalizedItems.set(entry.menuItemId, next);
    }

    const ids = [...normalizedItems.keys()];
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: ids }, businessId },
    });
    if (menuItems.length !== ids.length) {
      sendError(res, "One or more items are invalid", 400, "MENU_ITEM_NOT_FOUND");
      return;
    }
    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    for (const [menuItemId] of normalizedItems) {
      const menuItem = menuItemMap.get(menuItemId);
      if (!menuItem || !menuItem.isAvailable) {
        sendError(res, "One or more items are unavailable", 400, "MENU_ITEM_UNAVAILABLE");
        return;
      }
    }

    let totalAmount = new Prisma.Decimal(0);
    for (const [menuItemId, quantity] of normalizedItems) {
      const menuItem = menuItemMap.get(menuItemId);
      if (!menuItem) continue;
      totalAmount = totalAmount.plus(menuItem.price.mul(quantity));
    }

    if (paymentMethod === "razorpay" && !isRazorpayConfigured()) {
      sendError(res, "Razorpay not configured", 500, "RAZORPAY_NOT_CONFIGURED");
      return;
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          businessId,
          tableId,
          customerUserId: customer.id,
          status: "pending",
          totalAmount,
          paymentStatus: paymentMethod === "cash" ? "unpaid" : "pending",
          paymentMethod,
          customerName,
          customerPhone: customerPhone?.trim() ? customerPhone.trim() : null,
        },
      });
      await tx.orderItem.createMany({
        data: [...normalizedItems.entries()].map(([menuItemId, quantity]) => ({
          orderId: created.id,
          orderCreatedAt: created.createdAt,
          menuItemId,
          quantity,
          unitPrice: menuItemMap.get(menuItemId)!.price,
          specialInstructions: null,
        })),
      });
      return created;
    });

    const snapshot = await fetchOrderSnapshot(order.id);
    if (snapshot) {
      await publishOrderEventBestEffort({
        type: "order_created",
        order: snapshot.order,
        items: snapshot.items,
      });
    }

    sendSuccess(res, {
      orderId: order.id,
      amount: order.totalAmount.toString(),
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
    });
  })
);

router.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const customer = await readCustomerFromRequest(req);
    if (!customer) {
      sendError(res, "Customer login required", 401, "CUSTOMER_AUTH_REQUIRED");
      return;
    }

    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    const cursorOrder = cursor
      ? await prisma.order.findFirst({
          where: { id: cursor, customerUserId: customer.id },
          select: { id: true, updatedAt: true },
        })
      : null;

    const where: Prisma.OrderWhereInput = {
      customerUserId: customer.id,
    };

    if (cursorOrder) {
      where.OR = [
        { updatedAt: { lt: cursorOrder.updatedAt } },
        { updatedAt: cursorOrder.updatedAt, id: { lt: cursorOrder.id } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { business: { select: { id: true, name: true, currencyCode: true } } },
    });

    const hasNext = orders.length > limit;
    const page = hasNext ? orders.slice(0, limit) : orders;
    const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

    const orderIds = page.map((order) => order.id);
    const reviewModel = (prisma as typeof prisma & { review?: typeof prisma.review }).review;
    const reviewRows = reviewModel
      ? await reviewModel.findMany({
          where: { orderId: { in: orderIds } },
          select: { id: true, orderId: true },
        })
      : [];
    const reviewMap = new Map(reviewRows.map((row) => [row.orderId, row.id]));
    const missingOrderIds = orderIds.filter((id) => !reviewMap.has(id));
    const warehouseReviewMap = await fetchWarehouseReviewIdsByOrderIds(missingOrderIds);

    sendSuccess(res, {
      orders: page.map((order) => ({
        id: order.id,
        businessId: order.businessId,
        tableId: order.tableId,
        status: order.status,
        totalAmount: order.totalAmount.toString(),
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        reviewId: reviewMap.get(order.id) ?? warehouseReviewMap.get(order.id) ?? null,
        business: order.business
          ? {
              id: order.business.id,
              name: order.business.name,
              currencyCode: order.business.currencyCode,
            }
          : null,
      })),
      nextCursor,
    });
  })
);

router.post(
  "/orders/:id/checkout",
  asyncHandler(async (req, res) => {
    const customer = await readCustomerFromRequest(req);
    if (!customer) {
      sendError(res, "Customer login required", 401, "CUSTOMER_AUTH_REQUIRED");
      return;
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, customerUserId: customer.id },
      include: {
        business: { select: { currencyCode: true, name: true } },
      },
    });
    if (!order) {
      sendError(res, "Order not found", 404, "ORDER_NOT_FOUND");
      return;
    }
    if (order.paymentStatus === "paid") {
      sendError(res, "Order already paid", 409, "ORDER_ALREADY_PAID");
      return;
    }
    if (order.paymentMethod !== "razorpay") {
      sendError(res, "Order is not eligible for Razorpay checkout", 400, "PAYMENT_METHOD_INVALID");
      return;
    }
    const amount = Math.round(Number(order.totalAmount) * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      sendError(res, "Invalid order total", 422, "INVALID_ORDER_TOTAL");
      return;
    }

    const { getRazorpay } = await import("../services/razorpay");
    let razorpay;
    try {
      razorpay = getRazorpay();
    } catch {
      sendError(res, "Razorpay not configured", 500, "RAZORPAY_NOT_CONFIGURED");
      return;
    }

    const razorpayOrder = await razorpay.orders.create({
      amount,
      currency: order.business.currencyCode.toUpperCase(),
      receipt: order.id,
      notes: {
        businessName: order.business.name,
        orderId: order.id,
      },
    });

    await prisma.order.update({
      where: { id_createdAt: { id: order.id, createdAt: order.createdAt } },
      data: { razorpayOrderId: razorpayOrder.id },
    });

    sendSuccess(res, {
      razorpayOrderId: razorpayOrder.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount,
      currency: order.business.currencyCode.toUpperCase(),
      businessName: order.business.name,
    });
  })
);

router.post(
  "/orders/:id/verify-payment",
  asyncHandler(async (req, res) => {
    const customer = await readCustomerFromRequest(req);
    if (!customer) {
      sendError(res, "Customer login required", 401, "CUSTOMER_AUTH_REQUIRED");
      return;
    }
    const parsed = verifyPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Invalid payment payload", 400, "INVALID_PAYMENT_PAYLOAD");
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, customerUserId: customer.id },
      select: {
        id: true,
        createdAt: true,
        paymentStatus: true,
        razorpayOrderId: true,
        paymentMethod: true,
        customerUserId: true,
      },
    });
    if (!order) {
      sendError(res, "Order not found", 404, "ORDER_NOT_FOUND");
      return;
    }
    if (order.paymentStatus === "paid") {
      sendError(res, "Order already paid", 409, "ORDER_ALREADY_PAID");
      return;
    }
    if (order.paymentMethod !== "razorpay") {
      sendError(res, "Order is not eligible for Razorpay verification", 400, "PAYMENT_METHOD_INVALID");
      return;
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      sendError(res, "Razorpay not configured", 500, "RAZORPAY_NOT_CONFIGURED");
      return;
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      parsed.data;
    if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) {
      sendError(res, "Order mismatch", 409, "PAYMENT_ORDER_MISMATCH");
      return;
    }

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      sendError(res, "Payment verification failed", 400, "PAYMENT_VERIFICATION_FAILED");
      return;
    }

    const updated = await prisma.order.update({
      where: { id_createdAt: { id: order.id, createdAt: order.createdAt } },
      data: {
        paymentStatus: "paid",
        status: "confirmed",
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
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

    sendSuccess(res, { ok: true });
  })
);

router.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const customer = await readCustomerFromRequest(req);
    if (!customer) {
      sendError(res, "Customer login required", 401, "CUSTOMER_AUTH_REQUIRED");
      return;
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, customerUserId: customer.id },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
        business: { select: { name: true, currencyCode: true } },
      },
    });
    if (!order) {
      sendError(res, "Order not found", 404, "ORDER_NOT_FOUND");
      return;
    }
    const reviewModel = (prisma as typeof prisma & { review?: typeof prisma.review }).review;
    const reviewRow = reviewModel
      ? await reviewModel.findFirst({
          where: { orderId: order.id },
          select: { id: true },
        })
      : null;
    let reviewId = reviewRow?.id ?? null;
    if (!reviewId) {
      const warehouseMap = await fetchWarehouseReviewIdsByOrderIds([order.id]);
      reviewId = warehouseMap.get(order.id) ?? null;
    }
    sendSuccess(res, {
      business: order.business
        ? {
            name: order.business.name,
            currencyCode: order.business.currencyCode,
          }
        : null,
      order: {
        id: order.id,
        businessId: order.businessId,
        tableId: order.tableId,
        status: order.status,
        totalAmount: order.totalAmount.toString(),
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt.toISOString(),
        reviewId,
      },
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.menuItem?.name ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        specialInstructions: item.specialInstructions,
      })),
    });
  })
);

router.post(
  "/reviews",
  asyncHandler(async (req, res) => {
    const customer = await readCustomerFromRequest(req);
    if (!customer) {
      sendError(res, "Customer login required", 401, "CUSTOMER_AUTH_REQUIRED");
      return;
    }

    const parsed = reviewCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: parsed.data.orderId, customerUserId: customer.id },
      select: { id: true, createdAt: true, businessId: true, status: true },
    });
    if (!order) {
      sendError(res, "Order not found", 404, "ORDER_NOT_FOUND");
      return;
    }
    if (order.status !== "completed") {
      sendError(res, "Order is not completed", 409, "ORDER_NOT_COMPLETED");
      return;
    }

    const reviewModel = (prisma as typeof prisma & { review?: typeof prisma.review }).review;
    if (!reviewModel) {
      sendError(res, "Review service unavailable", 500, "REVIEWS_UNAVAILABLE");
      return;
    }
    const existing = await reviewModel.findFirst({
      where: { orderId: order.id, orderCreatedAt: order.createdAt },
      select: { id: true },
    });
    if (existing) {
      sendError(res, "Review already exists", 409, "REVIEW_ALREADY_EXISTS");
      return;
    }

    const comment =
      typeof parsed.data.comment === "string" ? parsed.data.comment.trim() : null;

    const review = await reviewModel.create({
      data: {
        orderId: order.id,
        orderCreatedAt: order.createdAt,
        businessId: order.businessId,
        customerUserId: customer.id,
        rating: parsed.data.rating,
        comment: comment && comment.length > 0 ? comment : null,
      },
    });

    await invalidateReviewCacheForBusiness(order.businessId);

    sendSuccess(res, {
      review: {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        likesCount: 0,
      },
    });
  })
);

router.post(
  "/reviews/:id/like",
  asyncHandler(async (req, res) => {
    const customer = await readCustomerFromRequest(req);
    if (!customer) {
      sendError(res, "Customer login required", 401, "CUSTOMER_AUTH_REQUIRED");
      return;
    }

    const reviewModel = (prisma as typeof prisma & { review?: typeof prisma.review }).review;
    if (!reviewModel) {
      sendError(res, "Review service unavailable", 500, "REVIEWS_UNAVAILABLE");
      return;
    }
    const review = await reviewModel.findUnique({
      where: { id: req.params.id },
      select: { id: true, businessId: true },
    });
    if (!review) {
      sendError(res, "Review not found", 404, "REVIEW_NOT_FOUND");
      return;
    }

    const reviewLikeModel = (prisma as typeof prisma & { reviewLike?: typeof prisma.reviewLike }).reviewLike;
    if (!reviewLikeModel) {
      sendError(res, "Review service unavailable", 500, "REVIEWS_UNAVAILABLE");
      return;
    }
    const existing = await reviewLikeModel.findUnique({
      where: {
        reviewId_customerUserId: {
          reviewId: review.id,
          customerUserId: customer.id,
        },
      },
      select: { id: true },
    });

    let liked = false;
    if (existing) {
      await reviewLikeModel.delete({ where: { id: existing.id } });
    } else {
      await reviewLikeModel.create({
        data: {
          reviewId: review.id,
          customerUserId: customer.id,
        },
      });
      liked = true;
    }

    const likesCount = await reviewLikeModel.count({ where: { reviewId: review.id } });
    await invalidateReviewCacheForBusiness(review.businessId);

    sendSuccess(res, { liked, likesCount });
  })
);

router.get(
  "/reviews",
  asyncHandler(async (req, res) => {
    const parsed = reviewListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const { businessId, rating, page, limit, scope } = parsed.data;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, status: true, archivedAt: true, blocked: true },
    });
    if (!business || business.status !== "approved" || business.archivedAt || business.blocked) {
      sendError(res, "Business is not available", 404, "BUSINESS_NOT_AVAILABLE");
      return;
    }

    const ratingFilter = rating ?? null;
    const cacheVersion = await getReviewCacheVersion(businessId);
    const cacheKey = buildReviewCacheKey([
      businessId,
      `v${cacheVersion}`,
      scope,
      ratingFilter ? `rating-${ratingFilter}` : "rating-all",
      `page-${page}`,
      `limit-${limit}`,
    ]);

    const cached = await getReviewCache<{
      reviews: Array<{
        id: string;
        rating: number;
        comment: string | null;
        createdAt: string;
        likesCount: number;
      }>;
      summary: {
        averageRating: number;
        totalReviews: number;
        ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
      };
      page: number;
      limit: number;
      total: number;
      scope: "recent" | "all";
      ratingFilter: number | null;
    }>(cacheKey);

    let responsePayload = cached;

    if (!responsePayload) {
      const cutoff = getReviewCutoff();
      const where: Prisma.ReviewWhereInput = {
        OR: [{ businessId }, { order: { businessId } }],
        ...(ratingFilter ? { rating: ratingFilter } : {}),
        ...(scope === "recent" ? { createdAt: { gte: cutoff } } : {}),
      };

      const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
        scope === "recent"
          ? [{ createdAt: "desc" }]
          : [{ likes: { _count: "desc" } }, { createdAt: "desc" }];

      const reviewModel = (prisma as typeof prisma & { review?: typeof prisma.review }).review;
      if (!reviewModel) {
        sendError(res, "Review service unavailable", 500, "REVIEWS_UNAVAILABLE");
        return;
      }

      const [aggregate, grouped] = await prisma.$transaction([
        reviewModel.aggregate({
          where,
          _count: { _all: true },
          _avg: { rating: true },
        }),
        reviewModel.groupBy({
          by: ["rating"],
          where,
          _count: { _all: true },
        }),
      ]);

      const pgSummary = {
        total: aggregate._count._all ?? 0,
        avg: aggregate._avg.rating ?? null,
        ratingCounts: buildRatingCounts(),
      };

      grouped.forEach((row) => {
        const ratingValue = row.rating as 1 | 2 | 3 | 4 | 5;
        pgSummary.ratingCounts[ratingValue] = row._count._all ?? 0;
      });

      const pgFetchLimit = scope === "all" ? page * limit : limit;
      const pgReviews = await reviewModel.findMany({
        where,
        orderBy,
        take: pgFetchLimit,
        skip: scope === "recent" ? (page - 1) * limit : undefined,
        include: { _count: { select: { likes: true } } },
      });

      const pgItems = pgReviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        likesCount: review._count.likes,
      }));

      let total = pgSummary.total;
      let summary = {
        averageRating: pgSummary.total
          ? Number(((pgSummary.avg ?? 0) as number).toFixed(2))
          : 0,
        totalReviews: pgSummary.total,
        ratingCounts: { ...pgSummary.ratingCounts },
      };

      let items = pgItems;

      if (scope === "all") {
        const [warehouseSummary, warehouseRows] = await Promise.all([
          fetchWarehouseReviewSummary({ businessId, ratingFilter }),
          fetchWarehouseReviews({ businessId, ratingFilter, limit: page * limit }),
        ]);

        if (warehouseSummary) {
          total += warehouseSummary.total;
          const combinedTotal = pgSummary.total + warehouseSummary.total;
          const weightedAvg =
            combinedTotal === 0
              ? 0
              : ((pgSummary.avg ?? 0) * pgSummary.total +
                  (warehouseSummary.avg ?? 0) * warehouseSummary.total) /
                combinedTotal;
          summary = {
            averageRating: Number(weightedAvg.toFixed(2)),
            totalReviews: combinedTotal,
            ratingCounts: {
              1: pgSummary.ratingCounts[1] + warehouseSummary.ratingCounts[1],
              2: pgSummary.ratingCounts[2] + warehouseSummary.ratingCounts[2],
              3: pgSummary.ratingCounts[3] + warehouseSummary.ratingCounts[3],
              4: pgSummary.ratingCounts[4] + warehouseSummary.ratingCounts[4],
              5: pgSummary.ratingCounts[5] + warehouseSummary.ratingCounts[5],
            },
          };
        }

        const merged = new Map<string, (typeof pgItems)[number]>();
        pgItems.forEach((item) => merged.set(item.id, item));
        warehouseRows.forEach((row) => {
          if (merged.has(row.review_id)) return;
          merged.set(row.review_id, {
            id: row.review_id,
            rating: row.rating,
            comment: row.comment,
            createdAt: normalizeCreatedAt(row.created_at),
            likesCount: row.likes_count,
          });
        });

        const sorted = Array.from(merged.values()).sort((a, b) => {
          if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        items = sorted.slice((page - 1) * limit, page * limit);
      }

      responsePayload = {
        reviews: items,
        summary,
        page,
        limit,
        total,
        scope,
        ratingFilter,
      };

      await setReviewCache(cacheKey, responsePayload);
    }

    const customer = await readCustomerFromRequest(req);
    if (customer && responsePayload.reviews.length > 0) {
      const reviewLikeModel = (prisma as typeof prisma & { reviewLike?: typeof prisma.reviewLike }).reviewLike;
      if (!reviewLikeModel) {
        sendError(res, "Review service unavailable", 500, "REVIEWS_UNAVAILABLE");
        return;
      }
      const likedRows = await reviewLikeModel.findMany({
        where: {
          customerUserId: customer.id,
          reviewId: { in: responsePayload.reviews.map((review) => review.id) },
        },
        select: { reviewId: true },
      });
      const likedSet = new Set(likedRows.map((row) => row.reviewId));
      responsePayload = {
        ...responsePayload,
        reviews: responsePayload.reviews.map((review) => ({
          ...review,
          likedByCustomer: likedSet.has(review.id),
        })),
      };
    }

    sendSuccess(res, responsePayload);
  })
);

router.get(
  "/menu/:slug",
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const tableNumberParam = req.query.table as string | undefined;
    const qrToken = req.query.token as string | undefined;

    const business = await prisma.business.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        currencyCode: true,
        status: true,
        archivedAt: true,
      },
    });

    if (!business || business.status !== "approved" || business.archivedAt) {
      sendError(res, "Business is not available", 404, "BUSINESS_NOT_AVAILABLE");
      return;
    }

    const tableNumber = tableNumberParam ? Number(tableNumberParam) : null;
    if (tableNumberParam && (Number.isNaN(tableNumber) || (tableNumber ?? 0) <= 0)) {
      sendError(res, "Invalid table", 400, "INVALID_TABLE");
      return;
    }

    let resolvedTable: { id: string; tableNumber: number; isActive: boolean } | null = null;

    if (qrToken) {
      let qrCode = await prisma.qrCode.findUnique({
        where: { uniqueCode: qrToken },
        include: {
          business: { select: { id: true, status: true, archivedAt: true } },
          table: { select: { id: true, tableNumber: true, isActive: true } },
        },
      });

      if (!qrCode) {
        const rotation = await prisma.qrCodeRotation.findFirst({
          where: {
            oldToken: qrToken,
            graceExpiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          include: {
            qrCode: {
              include: {
                business: { select: { id: true, status: true, archivedAt: true } },
                table: { select: { id: true, tableNumber: true, isActive: true } },
              },
            },
          },
        });
        if (rotation) {
          qrCode = rotation.qrCode;
        }
      }

      if (!qrCode) {
        sendError(res, "QR token not found", 404, "QR_NOT_FOUND");
        return;
      }

      if (qrCode.business.id !== business.id || qrCode.business.status !== "approved") {
        sendError(res, "QR token is not valid for this business", 403, "QR_NOT_ASSOCIATED");
        return;
      }

      if (!qrCode.table.isActive) {
        sendError(res, "Table is inactive", 403, "TABLE_INACTIVE");
        return;
      }

      if (tableNumber && qrCode.table.tableNumber !== tableNumber) {
        sendError(res, "QR token does not match table", 400, "QR_TABLE_MISMATCH");
        return;
      }

      resolvedTable = qrCode.table;
    }

    if (tableNumber && !resolvedTable) {
      const table = await prisma.table.findUnique({
        where: {
          businessId_tableNumber: { businessId: business.id, tableNumber },
        },
        select: { id: true, tableNumber: true, isActive: true },
      });
      if (!table) {
        sendError(res, "Table not found", 404, "TABLE_NOT_FOUND");
        return;
      }
      if (!table.isActive) {
        sendError(res, "Table is inactive", 403, "TABLE_INACTIVE");
        return;
      }
      resolvedTable = table;
    }

    const categories = await prisma.category.findMany({
      where: { businessId: business.id },
      orderBy: { sortOrder: "asc" },
      include: {
        menuItems: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const serialized = categories.map((category: (typeof categories)[number]) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      items: category.menuItems.map((item: (typeof category.menuItems)[number]) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price.toString(),
        dietaryTags: item.dietaryTags,
        imageUrl: resolveImageUrl(item.imagePath),
        isAvailable: item.isAvailable,
        sortOrder: item.sortOrder,
      })),
    }));

    sendSuccess(res, {
      business: {
        id: business.id,
        name: business.name,
        slug,
        currencyCode: business.currencyCode,
      },
      table: resolvedTable
        ? {
            id: resolvedTable.id,
            number: resolvedTable.tableNumber,
          }
        : null,
      categories: serialized,
    });
  })
);

export default router;
