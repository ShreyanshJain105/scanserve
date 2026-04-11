import { randomUUID } from "crypto";
import type { Response } from "express";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const isProd = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN?.trim();

const cookieDomainOption = COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {};

export const csrfCookieOptions = {
  httpOnly: false,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  ...cookieDomainOption,
};

export const issueCsrfToken = (res: Response) => {
  const token = randomUUID();
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  return token;
};
