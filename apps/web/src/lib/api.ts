"use client";

import type { ApiResponse } from "@scan2serve/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const defaultHeaders = {
  "Content-Type": "application/json",
};

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
  const isFormDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const mergedHeaders = isFormDataBody
    ? { ...(options.headers || {}) }
    : {
        ...defaultHeaders,
        ...(options.headers || {}),
      };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: mergedHeaders,
  });

  if (response.status === 401 && retryOn401) {
    const refreshed = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
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
