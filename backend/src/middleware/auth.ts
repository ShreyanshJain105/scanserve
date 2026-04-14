import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

type JwtPayload = {
  sub: string;
  role: string;
  email?: string;
  exp: number;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        role: string;
        email?: string;
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const sendAuthError = (res: Response, message = "Unauthorized") => {
  return res.status(401).json({ status: 0, error: { message } });
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const bearer = req.headers.authorization;
    const bearerToken = bearer?.startsWith("Bearer ")
      ? bearer.substring(7)
      : null;
    const cookieToken = req.cookies?.access_token;
    const token = bearerToken || cookieToken;
    if (!token) return sendAuthError(res);

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, role: true, email: true },
    });
    if (!user) return sendAuthError(res);
    if (user.role !== decoded.role) return sendAuthError(res);
    req.user = { id: user.id, role: user.role, email: user.email ?? decoded.email };
    return next();
  } catch (err) {
    return sendAuthError(res);
  }
};

export const requireRole =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return sendAuthError(res);
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 0,
        error: { message: "Forbidden" },
      });
    }
    return next();
  };

// Optional helper to ensure refresh token is still valid (for future use)
export const assertRefreshTokenValid = async (
  refreshTokenId: string,
  userId: string
) => {
  const token = await prisma.refreshToken.findUnique({
    where: { id: refreshTokenId },
  });
  if (!token || token.userId !== userId || token.revokedAt) {
    throw new Error("Invalid refresh token");
  }
  if (token.expiresAt < new Date()) {
    throw new Error("Expired refresh token");
  }
  return token;
};
