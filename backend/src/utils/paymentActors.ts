import type { Prisma } from "@prisma/client";
import type { StatusActorInfo } from "./statusActors";

export type PaymentActors = {
  paidBy?: StatusActorInfo | null;
  paidAt?: string | null;
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

export const normalizePaymentActors = (
  value: Prisma.JsonValue | null | undefined
): PaymentActors | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const paidBy = coerceActorInfo(record.paidBy);
  const paidAt = typeof record.paidAt === "string" ? record.paidAt : null;

  if (!paidBy && !paidAt) return null;
  return { paidBy: paidBy ?? null, paidAt };
};
