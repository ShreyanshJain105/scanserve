"use client";

import type { ApiResponse } from "@scan2serve/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const getBaseDomain = (host: string) => {
  const hostname = host.split(":")[0] ?? "";
  if (!hostname || hostname === "localhost") return hostname || "localhost";
  if (hostname.endsWith(".localhost")) return "localhost";
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
};

const getPort = (host: string, protocol: string) => {
  const parts = host.split(":");
  if (parts.length > 1) return parts[1] ?? "";
  return protocol === "https:" ? "443" : "80";
};

const resolveApiBase = () => {
  if (!API_URL) return "";
  if (API_URL.startsWith("/")) return API_URL;
  if (typeof window === "undefined") return API_URL;

  try {
    const apiUrl = new URL(API_URL);
    const apiHost = apiUrl.host;
    const currentHost = window.location.host;
    const apiPort = getPort(apiHost, apiUrl.protocol);
    const currentPort = getPort(currentHost, window.location.protocol);
    const samePort = apiPort === currentPort;
    const sameBaseDomain = getBaseDomain(apiHost) === getBaseDomain(currentHost);

    if (samePort && sameBaseDomain) {
      return "";
    }
  } catch {
    return API_URL;
  }

  return API_URL;
};

export const getApiBase = () => resolveApiBase();

const defaultHeaders = {
  "Content-Type": "application/json",
};

const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

let cachedCsrfToken: string | null = null;

const readCookieValue = (name: string) => {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
};

const getCsrfToken = () => {
  const token = readCookieValue(CSRF_COOKIE_NAME);
  if (token && token !== cachedCsrfToken) {
    cachedCsrfToken = token;
  }
  return cachedCsrfToken;
};

export const ensureCsrfToken = async () => {
  const existing = getCsrfToken();
  if (existing) return existing;
  const baseUrl = resolveApiBase();
  const response = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: "GET",
    credentials: "include",
  });
  const body = await parseResponse<{ csrfToken: string }>(response);
  if (body.status === 1) {
    cachedCsrfToken = body.data?.csrfToken ?? null;
    return cachedCsrfToken;
  }
  return null;
};

const isMutatingMethod = (method?: string) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes((method || "GET").toUpperCase());

async function parseResponse<T>(res: Response): Promise<ApiResponse<T>> {
  const data = await res.json();
  return data as ApiResponse<T>;
}

function normalizeErrorMessage(message?: string): string {
  if (!message) return "Request failed";
  const trimmed = message.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const lines = parsed
        .map((entry) => (typeof entry?.message === "string" ? entry.message : null))
        .filter((entry): entry is string => Boolean(entry));
      if (lines.length > 0) return lines.join(" ");
    }
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const parsedMessage = (parsed as { message?: unknown }).message;
      if (typeof parsedMessage === "string" && parsedMessage.trim()) return parsedMessage;
    }
  } catch {
    // Message is plain text.
  }

  if (trimmed.startsWith("[") && trimmed.includes("\"message\"")) {
    return "Please check the entered details and try again.";
  }

  return trimmed;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  { retryOn401 = true }: { retryOn401?: boolean } = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const needsCsrf = isMutatingMethod(options.method);
  const csrfToken = needsCsrf ? await ensureCsrfToken() : null;
  const isFormDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const mergedHeaders = isFormDataBody
    ? { ...(options.headers || {}) }
    : {
        ...defaultHeaders,
        ...(options.headers || {}),
      };
  if (needsCsrf && csrfToken) {
    (mergedHeaders as Record<string, string>)[CSRF_HEADER_NAME] = csrfToken;
  }

  const cache = options.cache ?? (method === "GET" ? "no-store" : undefined);

  const baseUrl = resolveApiBase();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: mergedHeaders,
    cache,
  });

  if (response.status === 401 && retryOn401) {
    const refreshCsrfToken = await ensureCsrfToken();
    const qrTokenHeader =
      typeof mergedHeaders === "object" && mergedHeaders !== null
        ? (mergedHeaders as Record<string, string>)["x-qr-token"]
        : undefined;
    const refreshHeaders: Record<string, string> = {};
    if (qrTokenHeader) refreshHeaders["x-qr-token"] = qrTokenHeader;
    if (refreshCsrfToken) refreshHeaders[CSRF_HEADER_NAME] = refreshCsrfToken;
    const refreshed = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: Object.keys(refreshHeaders).length ? refreshHeaders : undefined,
    });
    const refreshBody = await parseResponse<unknown>(refreshed);
    if (refreshBody.status === 1) {
      return apiFetch<T>(path, options, { retryOn401: false });
    }
  }

  const body = await parseResponse<T>(response);
  if (body.status === 1 && body.data !== undefined) {
    return body.data;
  }
  const message = normalizeErrorMessage(body.error?.message);
  throw new Error(message);
}
