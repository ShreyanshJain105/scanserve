import express from "express";
import jwt from "jsonwebtoken";
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
import { consumeQrAuthAttempt } from "../middleware/qrAuthRateLimit";
import { sendError, sendSuccess } from "../utils/response";
import { issueCsrfToken } from "../utils/csrf";
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
  path: "/",
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
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

type AuthScope = "business" | "customer";
type LogoutScope = AuthScope | "all";

type JwtPayload = {
  sub: string;
  role: UserRole;
  email?: string;
};

const readUserFromAccessToken = async (
  token: string | undefined,
  expectedScope: AuthScope
) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
    });
    if (!user) return null;
    if (expectedScope === "customer" && user.role !== "customer") return null;
    if (expectedScope === "business" && user.role === "customer") return null;
    return user;
  } catch {
    return null;
  }
};

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

const validateQrContext = async (qrToken?: string) => {
  if (!qrToken || !customerQrAuthEnabled) return null;
  const qrContext = await resolveQrContext(qrToken);
  if (!qrContext) return null;
  if (qrContext.business.status !== "approved") {
    return null;
  }
  if (!qrContext.table.isActive) {
    return null;
  }
  if (qrTokenMaxAgeDays > 0) {
    const ageMs = Date.now() - qrContext.createdAt.getTime();
    const maxAgeMs = qrTokenMaxAgeDays * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      return null;
    }
  }
  return qrContext;
};

const readQrToken = (req: express.Request, bodyQrToken?: string) => {
  if (bodyQrToken && bodyQrToken.trim()) return bodyQrToken.trim();
  const queryQrToken = req.query.qrToken;
  if (typeof queryQrToken === "string" && queryQrToken.trim()) return queryQrToken.trim();
  const queryToken = req.query.token;
  if (typeof queryToken === "string" && queryToken.trim()) return queryToken.trim();
  const header = req.headers["x-qr-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header) && typeof header[0] === "string" && header[0].trim()) {
    return header[0].trim();
  }
  return undefined;
};

const resolveAuthScope = async (req: express.Request, bodyQrToken?: string): Promise<AuthScope> => {
  const qrToken = readQrToken(req, bodyQrToken);
  const qrContext = await validateQrContext(qrToken);
  return qrContext ? "customer" : "business";
};

const getScopedCookieNames = (scope: AuthScope) => {
  if (scope === "customer") {
    return {
      accessCookieName: "qr_customer_access",
      refreshCookieName: "qr_customer_refresh",
      accessOptions: qrAccessCookieOptions,
      refreshOptions: qrRefreshCookieOptions,
    };
  }

  return {
    accessCookieName: "access_token",
    refreshCookieName: "refresh_token",
    accessOptions: accessCookieOptions,
    refreshOptions: refreshCookieOptions,
  };
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
  role: z.enum(["customer", "business"] as [UserRole, ...UserRole[]]).optional(),
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
    const scope = await resolveAuthScope(req, qrToken);
    if (role === "customer" && scope !== "customer") {
      return sendError(res, "Customer auth is only allowed in QR flow", 403, "CUSTOMER_AUTH_QR_ONLY");
    }
    if (scope === "customer") {
      if (!assertQrRateLimit(req, res, qrToken, email)) return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return sendError(res, "Email already registered", 400, "EMAIL_EXISTS");
    }
    const resolvedRole: UserRole = scope === "customer" ? "customer" : "business";
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: resolvedRole },
    });
    return sendSuccess(res, {
      user: { id: user.id, email: user.email, role: user.role },
    }, 201);
  })
);

router.get(
  "/csrf",
  asyncHandler(async (_req, res) => {
    const token = issueCsrfToken(res);
    return sendSuccess(res, { csrfToken: token });
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
    const scope = await resolveAuthScope(req, qrToken);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return sendError(res, "Invalid credentials", 401, "INVALID_CREDENTIALS");

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid)
      return sendError(res, "Invalid credentials", 401, "INVALID_CREDENTIALS");

    if (scope === "customer") {
      if (!assertQrRateLimit(req, res, qrToken, email)) return;
      if (user.role !== "customer") {
        return sendError(res, "Invalid credentials", 401, "INVALID_CREDENTIALS");
      }
    } else if (user.role === "customer") {
      return sendError(res, "Customer auth is only allowed in QR flow", 403, "CUSTOMER_AUTH_QR_ONLY");
    }

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await mintRefreshToken(user.id);

    const { accessCookieName, refreshCookieName, accessOptions, refreshOptions } =
      getScopedCookieNames(scope);

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
    const scope = await resolveAuthScope(req);
    const { refreshCookieName, accessCookieName, accessOptions, refreshOptions } =
      getScopedCookieNames(scope);
    const standard = req.cookies?.refresh_token as string | undefined;
    const qr = req.cookies?.qr_customer_refresh as string | undefined;
    const incoming = refreshCookieName === "qr_customer_refresh" ? qr : standard;
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

      if (scope === "customer" && user.role !== "customer") {
        return sendError(res, "Invalid or expired refresh token", 401, "INVALID_REFRESH");
      }
      if (scope === "business" && user.role === "customer") {
        return sendError(res, "Invalid or expired refresh token", 401, "INVALID_REFRESH");
      }

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
    const logoutScopeSchema = z.object({
      scope: z.enum(["business", "customer", "all"]).optional(),
    });
    const parsed = logoutScopeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
    }

    const scope = await resolveAuthScope(req);
    const targetScope: LogoutScope = parsed.data.scope ?? scope;
    const standard = req.cookies?.refresh_token as string | undefined;
    const qr = req.cookies?.qr_customer_refresh as string | undefined;

    if (targetScope === "customer" || targetScope === "all") {
      if (qr) await revokeRefreshToken(qr);
      res.clearCookie("qr_customer_access", qrAccessCookieOptions);
      res.clearCookie("qr_customer_refresh", qrRefreshCookieOptions);
    }

    if (targetScope === "business" || targetScope === "all") {
      if (standard) await revokeRefreshToken(standard);
      res.clearCookie("access_token", accessCookieOptions);
      res.clearCookie("refresh_token", refreshCookieOptions);
    }
    return sendSuccess(res, { message: "Logged out" });
  })
);

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const scope = await resolveAuthScope(req);
    const accessToken =
      scope === "customer"
        ? (req.cookies?.qr_customer_access as string | undefined)
        : (req.cookies?.access_token as string | undefined);
    if (!accessToken) return sendError(res, "Unauthorized", 401, "UNAUTHORIZED");

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(accessToken, JWT_SECRET) as JwtPayload;
    } catch {
      return sendError(res, "Unauthorized", 401, "UNAUTHORIZED");
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
    });
    if (!user) return sendError(res, "User not found", 404, "USER_NOT_FOUND");
    if (scope === "customer" && user.role !== "customer") {
      return sendError(res, "Unauthorized", 401, "UNAUTHORIZED");
    }
    if (scope === "business" && user.role === "customer") {
      return sendError(res, "Unauthorized", 401, "UNAUTHORIZED");
    }
    return sendSuccess(res, {
      user: { id: user.id, email: user.email, role: user.role },
    });
  })
);

router.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const activeScope = await resolveAuthScope(req);
    const businessToken = req.cookies?.access_token as string | undefined;
    const customerToken = req.cookies?.qr_customer_access as string | undefined;

    const [businessUser, customerUser] = await Promise.all([
      readUserFromAccessToken(businessToken, "business"),
      readUserFromAccessToken(customerToken, "customer"),
    ]);

    return sendSuccess(res, {
      activeScope,
      businessUser: businessUser
        ? { id: businessUser.id, email: businessUser.email, role: businessUser.role }
        : null,
      customerUser: customerUser
        ? { id: customerUser.id, email: customerUser.email, role: customerUser.role }
        : null,
    });
  })
);

export default router;
