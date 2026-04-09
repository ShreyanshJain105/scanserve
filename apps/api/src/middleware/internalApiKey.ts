import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

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

export const requireInternalApiKey = (
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
  const matches = providedKey === expectedKey || bearerKey === expectedKey;
  if (!matches) {
    return res.status(401).json({
      status: 0,
      error: { message: "INTERNAL_API_KEY_REQUIRED" },
    });
  }

  return next();
};
