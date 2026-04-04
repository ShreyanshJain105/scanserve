"use client";

import type { ApiResponse } from "@scan2serve/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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
  const response = await fetch(`${API_URL}/api/auth/csrf`, {
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

  const response = await fetch(`${API_URL}${path}`, {
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
    const refreshed = await fetch(`${API_URL}/api/auth/refresh`, {
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
