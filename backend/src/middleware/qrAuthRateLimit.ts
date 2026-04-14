import type { Request } from "express";

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

const now = () => Date.now();

const getWindowMs = () =>
  Math.max(1, Number(process.env.QR_AUTH_RATE_LIMIT_WINDOW_SEC || 60)) * 1000;

const getMaxAttempts = () =>
  Math.max(1, Number(process.env.QR_AUTH_RATE_LIMIT_MAX_ATTEMPTS || 10));

const getClientIp = (req: Request) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
};

const makeKey = (req: Request, qrToken?: string, email?: string) =>
  `${getClientIp(req)}|${email || "anon"}|${qrToken || "no-qr"}`;

export const consumeQrAuthAttempt = (req: Request, qrToken?: string, email?: string) => {
  const windowMs = getWindowMs();
  const maxAttempts = getMaxAttempts();
  const key = makeKey(req, qrToken, email);
  const ts = now();
  const existing = buckets.get(key);

  if (!existing || ts >= existing.resetAt) {
    const next: RateBucket = { count: 1, resetAt: ts + windowMs };
    buckets.set(key, next);
    return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  if (existing.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - ts) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - ts) / 1000)),
  };
};

export const __resetQrAuthRateLimitForTests = () => {
  buckets.clear();
};
