import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";

const PUBLIC_EXACT_PATHS = new Set([
  "/healthz",
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/csrf",
  "/api/auth/me",
  "/api/auth/sessions",
]);

const isPublicPath = (path: string) => {
  if (PUBLIC_EXACT_PATHS.has(path)) return true;
  return path.startsWith("/api/public/");
};

export const requireInternalApiKey = asyncHandler(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (process.env.NODE_ENV === "test") {
    return next();
  }

  if (isPublicPath(req.path)) {
    return next();
  }

  // Allow requests that have a valid session cookie (Frontend requests)
  if (req.cookies?.access_token || req.cookies?.qr_customer_access) {
    return next();
  }

  const expectedKey = process.env.INTERNAL_API_KEY?.trim();
  if (!expectedKey) {
    logger.error("internal_api_key.missing_env", {
      path: req.path,
      method: req.method,
    });
    return res.status(500).json({
      status: 0,
      error: { message: "Internal server error" },
    });
  }

  const providedKey = req.header("x-internal-api-key")?.trim();
  const authHeader = req.header("authorization")?.trim();
  const bearerPrefix = "Bearer ";
  const bearerKey =
    authHeader && authHeader.startsWith(bearerPrefix)
      ? authHeader.slice(bearerPrefix.length).trim()
      : null;
  
  const tokenToValidate = providedKey || bearerKey;
  const isJwt = (bearerKey && bearerKey.split(".").length === 3);

  if (!tokenToValidate && !isJwt) {
    return res.status(401).json({
      status: 0,
      error: { message: "INTERNAL_API_KEY_REQUIRED" },
    });
  }

  // If it's a JWT, allow it to pass to the requireAuth middleware
  if (isJwt) {
    return next();
  }

  if (!tokenToValidate) {
     return res.status(401).json({
      status: 0,
      error: { message: "INTERNAL_API_KEY_REQUIRED" },
    });
  }

  // 1. Check global system key
  if (tokenToValidate === expectedKey) {
    return next();
  }

  // 2. Check user-specific API keys
  const user = await prisma.user.findUnique({
    where: { apiKey: tokenToValidate },
    select: { id: true, role: true, email: true },
  });

  if (user) {
    req.user = { id: user.id, role: user.role, email: user.email };
    return next();
  }

  return res.status(401).json({
    status: 0,
    error: { message: "INVALID_INTERNAL_API_KEY" },
  });
});
