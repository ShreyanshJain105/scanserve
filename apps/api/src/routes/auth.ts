import express from "express";
import { z } from "zod";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  mintRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../services/authService";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { consumeQrAuthAttempt } from "../middleware/qrAuthRateLimit";
import { sendError, sendSuccess } from "../utils/response";
import type { UserRole } from "@scan2serve/shared";

const router: express.Router = express.Router();

const isProd = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;

const accessCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  domain: COOKIE_DOMAIN,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/api/auth/refresh",
  domain: COOKIE_DOMAIN,
};

const qrAccessCookieOptions = {
  ...accessCookieOptions,
  path: "/qr",
};

const qrRefreshCookieOptions = {
  ...refreshCookieOptions,
  path: "/api/auth/refresh",
};

const customerQrAuthEnabled =
  process.env.ENABLE_CUSTOMER_QR_AUTH !== undefined
    ? process.env.ENABLE_CUSTOMER_QR_AUTH === "true"
    : process.env.NODE_ENV !== "production";

const qrTokenMaxAgeDays = Math.max(
  0,
  Number(process.env.QR_TOKEN_MAX_AGE_DAYS || 0)
);

const resolveQrContext = async (qrToken?: string) => {
  if (!qrToken) return null;
  return prisma.qrCode.findUnique({
    where: { uniqueCode: qrToken },
    include: {
      business: {
        select: {
          id: true,
          status: true,
        },
      },
      table: {
        select: {
          id: true,
          isActive: true,
        },
      },
    },
  });
};

const assertCustomerQrAccess = async (res: express.Response, qrToken?: string) => {
  if (!customerQrAuthEnabled) {
    sendError(res, "Customer QR auth is disabled", 403, "CUSTOMER_QR_AUTH_DISABLED");
    return null;
  }
  const qrContext = await resolveQrContext(qrToken);
  if (!qrContext) {
    sendError(res, "Customer auth is only allowed in QR flow", 403, "CUSTOMER_AUTH_QR_ONLY");
    return null;
  }
  if (qrContext.business.status !== "approved") {
    sendError(res, "Business is not available", 403, "BUSINESS_NOT_AVAILABLE");
    return null;
  }
  if (!qrContext.table.isActive) {
    sendError(res, "Table is inactive", 403, "TABLE_INACTIVE");
    return null;
  }
  if (qrTokenMaxAgeDays > 0) {
    const ageMs = Date.now() - qrContext.createdAt.getTime();
    const maxAgeMs = qrTokenMaxAgeDays * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      sendError(res, "QR token expired", 403, "QR_TOKEN_EXPIRED");
      return null;
    }
  }
  return qrContext;
};

const assertQrRateLimit = (
  req: express.Request,
  res: express.Response,
  qrToken?: string,
  email?: string
) => {
  const rate = consumeQrAuthAttempt(req, qrToken, email);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSec));
    sendError(
      res,
      "Too many QR auth attempts. Please retry later.",
      429,
      "QR_AUTH_RATE_LIMITED"
    );
    return false;
  }
  return true;
};

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["customer", "business"] as [UserRole, ...UserRole[]]),
  qrToken: z.string().min(12).optional(),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) {
      return sendError(res, parse.error.message, 400, "VALIDATION_ERROR");
    }
    const { email, password, role, qrToken } = parse.data;
    if (role === "customer") {
      if (!assertQrRateLimit(req, res, qrToken, email)) return;
      const qrContext = await assertCustomerQrAccess(res, qrToken);
      if (!qrContext) return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return sendError(res, "Email already registered", 400, "EMAIL_EXISTS");
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role },
    });
    return sendSuccess(res, {
      user: { id: user.id, email: user.email, role: user.role },
    }, 201);
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  qrToken: z.string().min(12).optional(),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      return sendError(res, parse.error.message, 400, "VALIDATION_ERROR");
    }
    const { email, password, qrToken } = parse.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return sendError(res, "Invalid credentials", 401, "INVALID_CREDENTIALS");

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid)
      return sendError(res, "Invalid credentials", 401, "INVALID_CREDENTIALS");

    const isCustomer = user.role === "customer";
    if (isCustomer) {
      if (!assertQrRateLimit(req, res, qrToken, email)) return;
      const qrContext = await assertCustomerQrAccess(res, qrToken);
      if (!qrContext) return;
    }

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await mintRefreshToken(user.id);

    const accessCookieName = isCustomer ? "qr_customer_access" : "access_token";
    const refreshCookieName = isCustomer ? "qr_customer_refresh" : "refresh_token";
    const accessOptions = isCustomer ? qrAccessCookieOptions : accessCookieOptions;
    const refreshOptions = isCustomer ? qrRefreshCookieOptions : refreshCookieOptions;

    res.cookie(accessCookieName, accessToken, {
      ...accessOptions,
      maxAge: 1000 * 60 * Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 15),
    });
    res.cookie(refreshCookieName, refreshToken.plain, {
      ...refreshOptions,
      expires: refreshToken.record.expiresAt,
    });

    return sendSuccess(res, {
      user: { id: user.id, email: user.email, role: user.role },
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const standard = req.cookies?.refresh_token as string | undefined;
    const qr = req.cookies?.qr_customer_refresh as string | undefined;
    if (standard && qr) {
      return sendError(
        res,
        "Ambiguous refresh cookies",
        400,
        "MIXED_REFRESH_COOKIES"
      );
    }
    const incoming = standard || qr;
    if (!incoming) return sendError(res, "Missing refresh token", 401, "NO_REFRESH_TOKEN");

    try {
      const rotated = await rotateRefreshToken(incoming);

      const user = await prisma.user.findUnique({ where: { id: rotated.record.userId } });
      if (!user) throw new Error("User not found");

      const accessToken = signAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      const isCustomer = user.role === "customer";
      const accessCookieName = isCustomer ? "qr_customer_access" : "access_token";
      const refreshCookieName = isCustomer ? "qr_customer_refresh" : "refresh_token";
      const accessOptions = isCustomer ? qrAccessCookieOptions : accessCookieOptions;
      const refreshOptions = isCustomer ? qrRefreshCookieOptions : refreshCookieOptions;

      res.cookie(accessCookieName, accessToken, {
        ...accessOptions,
        maxAge: 1000 * 60 * Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 15),
      });
      res.cookie(refreshCookieName, rotated.plain, {
        ...refreshOptions,
        expires: rotated.record.expiresAt,
      });

      return sendSuccess(res, {
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (err) {
      return sendError(res, "Invalid or expired refresh token", 401, "INVALID_REFRESH");
    }
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const standard = req.cookies?.refresh_token as string | undefined;
    const qr = req.cookies?.qr_customer_refresh as string | undefined;
    if (standard) await revokeRefreshToken(standard);
    if (qr) await revokeRefreshToken(qr);
    res.clearCookie("access_token", accessCookieOptions);
    res.clearCookie("refresh_token", refreshCookieOptions);
    res.clearCookie("qr_customer_access", qrAccessCookieOptions);
    res.clearCookie("qr_customer_refresh", qrRefreshCookieOptions);
    return sendSuccess(res, { message: "Logged out" });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });
    if (!user) return sendError(res, "User not found", 404, "USER_NOT_FOUND");
    return sendSuccess(res, {
      user: { id: user.id, email: user.email, role: user.role },
    });
  })
);

export default router;
