import type { Prisma } from "@prisma/client";

export type StatusActorInfo = {
  userId: string | null;
  email: string | null;
};

const coerceActorInfo = (value: unknown): StatusActorInfo | null => {
  if (typeof value === "string") {
    return { userId: null, email: value };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const userId = typeof record.userId === "string" ? record.userId : null;
    const email = typeof record.email === "string" ? record.email : null;
    if (userId || email) {
      return { userId, email };
    }
  }
  return null;
};

export const normalizeStatusActors = (
  value: Prisma.JsonValue | null | undefined
): Record<string, StatusActorInfo> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, actor]) => {
      const info = coerceActorInfo(actor);
      return info ? [key, info] : null;
    })
    .filter((entry): entry is [string, StatusActorInfo] => Boolean(entry));

  return entries.length ? Object.fromEntries(entries) : null;
};
