import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_SITE_URL = "http://localhost:3000";
const DEFAULT_APP_URL = "http://app.localhost:3000";

const PUBLIC_ONLY_PREFIXES = ["/home", "/explore", "/menu", "/qr", "/orders"];
const APP_ONLY_PREFIXES = ["/dashboard", "/admin", "/login", "/register"];

const normalizeHost = (value: string) => value.split(",")[0].trim().toLowerCase();

const getConfiguredHost = (value: string | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
};

const isPathMatch = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isPublicRoute = (pathname: string) =>
  PUBLIC_ONLY_PREFIXES.some((prefix) => isPathMatch(pathname, prefix));

const isAppRoute = (pathname: string) =>
  APP_ONLY_PREFIXES.some((prefix) => isPathMatch(pathname, prefix));

export function middleware(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
  const siteHost = getConfiguredHost(siteUrl);
  const appHost = getConfiguredHost(appUrl);

  if (!siteHost || !appHost || siteHost === appHost) {
    return NextResponse.next();
  }

  const hostHeader =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const host = normalizeHost(hostHeader);
  const isAppHost = host === appHost;
  const isSiteHost = host === siteHost;

  if (!isAppHost && !isSiteHost) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (isAppHost && isPublicRoute(pathname)) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, siteUrl));
  }

  if (isSiteHost && isAppRoute(pathname)) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, appUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
