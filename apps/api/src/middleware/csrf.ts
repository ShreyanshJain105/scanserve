import type { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../utils/csrf";

const isMutatingMethod = (method: string) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());

export const requireCsrf = (req: Request, res: Response, next: NextFunction) => {
  if (!isMutatingMethod(req.method)) return next();

  const authHeader = req.header("authorization");
  if (authHeader && authHeader.trim()) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.header(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return sendError(res, "Invalid CSRF token", 403, "INVALID_CSRF");
  }

  return next();
};
