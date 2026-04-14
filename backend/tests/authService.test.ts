import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  mintRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../src/services/authService";

// Mock prisma
const refreshTokens: any[] = [];
vi.mock("../src/prisma", () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(async ({ data }) => {
        const rec = { id: `${refreshTokens.length + 1}`, ...data };
        refreshTokens.push(rec);
        return rec;
      }),
      findUnique: vi.fn(async ({ where: { tokenHash } }) =>
        refreshTokens.find((t) => t.tokenHash === tokenHash) || null
      ),
      update: vi.fn(async ({ where: { id }, data }) => {
        const idx = refreshTokens.findIndex((t) => t.id === id);
        if (idx >= 0) refreshTokens[idx] = { ...refreshTokens[idx], ...data };
        return refreshTokens[idx];
      }),
      updateMany: vi.fn(async ({ where: { tokenHash }, data }) => {
        refreshTokens.forEach((t, i) => {
          if (t.tokenHash === tokenHash) {
            refreshTokens[i] = { ...t, ...data };
          }
        });
      }),
    },
  },
}));

const dataSafeNow = () => new Date();

describe("authService", () => {
  beforeEach(() => {
    refreshTokens.length = 0;
  });

  it("hashes and verifies password", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).not.toBe("secret123");
    const ok = await verifyPassword("secret123", hash);
    expect(ok).toBe(true);
  });

  it("signs access token", () => {
    const token = signAccessToken({
      id: "u1",
      email: "a@b.com",
      role: "customer",
    });
    expect(typeof token).toBe("string");
  });

  it("mints and rotates refresh tokens", async () => {
    const first = await mintRefreshToken("u1");
    expect(first.plain).toBeTruthy();
    expect(refreshTokens).toHaveLength(1);

    const rotated = await rotateRefreshToken(first.plain);
    expect(rotated.plain).toBeTruthy();
    expect(refreshTokens).toHaveLength(2);
    expect(refreshTokens[0].revokedAt).toBeTruthy();
  });

  it("revokes refresh token", async () => {
    const first = await mintRefreshToken("u1");
    await revokeRefreshToken(first.plain);
    expect(refreshTokens[0].revokedAt).toBeTruthy();
  });
});
