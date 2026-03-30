import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../prisma";
import type { UserRole } from "@scan2serve/shared";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const ACCESS_TOKEN_TTL_MINUTES = Number(
  process.env.ACCESS_TOKEN_TTL_MINUTES || 15
);
const REFRESH_TOKEN_TTL_DAYS = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS || 7
);
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

const hashRefreshToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

const addMinutes = (minutes: number) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d;
};

export const hashPassword = (password: string) =>
  bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

export const verifyPassword = (password: string, hash: string) =>
  bcrypt.compare(password, hash);

export const signAccessToken = (user: {
  id: string;
  email: string;
  role: UserRole;
}) => {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    {
      expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m`,
    }
  );
};

type RefreshScope = "business" | "customer";

const getRefreshModel = (scope: RefreshScope) => {
  return scope === "customer" ? prisma.customerRefreshToken : prisma.refreshToken;
};

export const mintRefreshToken = async (userId: string, scope: RefreshScope = "business") => {
  const plain = crypto.randomUUID();
  const tokenHash = hashRefreshToken(plain);
  const expiresAt = addDays(REFRESH_TOKEN_TTL_DAYS);

  const record = await getRefreshModel(scope).create({
    data:
      scope === "customer"
        ? { customerUserId: userId, tokenHash, expiresAt }
        : { userId, tokenHash, expiresAt },
  });

  return { plain, record };
};

export const rotateRefreshToken = async (
  incomingToken: string,
  scope: RefreshScope = "business"
) => {
  const incomingHash = hashRefreshToken(incomingToken);
  const stored = await getRefreshModel(scope).findUnique({
    where: { tokenHash: incomingHash },
  });

  if (
    !stored ||
    stored.revokedAt ||
    stored.expiresAt < new Date()
  ) {
    throw new Error("Invalid refresh token");
  }

  await getRefreshModel(scope).update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const targetUserId =
    scope === "customer" ? (stored as { customerUserId: string }).customerUserId : stored.userId;
  return mintRefreshToken(targetUserId, scope);
};

export const revokeRefreshToken = async (
  token?: string,
  scope: RefreshScope = "business"
) => {
  if (!token) return;
  const tokenHash = hashRefreshToken(token);
  await getRefreshModel(scope).updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};
