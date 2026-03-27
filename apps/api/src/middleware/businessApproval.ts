import type { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma";
import { sendError } from "../utils/response";

declare global {
  namespace Express {
    interface Request {
      business?: {
        id: string;
        userId: string;
        status: "pending" | "approved" | "rejected" | "archived";
      };
      businessRole?: "owner" | "manager" | "staff";
    }
  }
}

const getBusinessIdFromRequest = (req: Request) => {
  const headerValue = req.header("x-business-id");
  if (headerValue) return headerValue;

  const queryValue = req.query.businessId;
  if (typeof queryValue === "string" && queryValue.trim().length > 0) {
    return queryValue;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyValue = (req.body as any)?.businessId;
  if (typeof bodyValue === "string" && bodyValue.trim().length > 0) {
    return bodyValue;
  }

  return null;
};

export const resolveBusinessForUser = async (req: Request) => {
  if (!req.user) return null;

  const requestedBusinessId = getBusinessIdFromRequest(req);
  if (requestedBusinessId) {
    const business = await prisma.business.findFirst({
      where: { id: requestedBusinessId },
      orderBy: { updatedAt: "desc" },
    });
    if (!business) return null;

    const membership = await prisma.businessMembership.findFirst({
      where: { businessId: business.id, userId: req.user.id },
    });
    if (membership) {
      req.businessRole = membership.role as "owner" | "manager" | "staff";
      return business;
    }

    if (business.userId === req.user.id) {
      req.businessRole = "owner";
      return business;
    }

    return null;
  }

  const memberships = await prisma.businessMembership.findMany({
    where: { userId: req.user.id },
    include: { business: true },
    orderBy: { createdAt: "desc" },
  });

  if (memberships.length > 0) {
    const approved = memberships.find(
      (membership: { business: { status: "pending" | "approved" | "rejected" | "archived" } }) =>
        membership.business.status === "approved"
    );
    const firstActive = memberships.find(
      (membership: { business: { status: "pending" | "approved" | "rejected" | "archived" } }) =>
        membership.business.status !== "archived"
    );
    const chosen = approved ?? firstActive ?? memberships[0];
    req.businessRole = chosen.role as "owner" | "manager" | "staff";
    return chosen.business;
  }

  const legacyBusinesses = await prisma.business.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
  });

  const approved = legacyBusinesses.find(
    (business: { status: "pending" | "approved" | "rejected" | "archived" }) =>
      business.status === "approved"
  );
  const firstActive = legacyBusinesses.find(
    (business: { status: "pending" | "approved" | "rejected" | "archived" }) =>
      business.status !== "archived"
  );
  if (approved) {
    req.businessRole = "owner";
    return approved;
  }
  if (firstActive) {
    req.businessRole = "owner";
    return firstActive;
  }
  if (legacyBusinesses[0]) {
    req.businessRole = "owner";
    return legacyBusinesses[0];
  }
  return null;
};

export const requireApprovedBusiness = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const business = await resolveBusinessForUser(req);
  if (!business) {
    return sendError(
      res,
      "Create a business profile before accessing this feature",
      403,
      "BUSINESS_PROFILE_REQUIRED"
    );
  }

  if (business.status === "pending") {
    return sendError(
      res,
      "Your business is pending admin approval",
      403,
      "BUSINESS_PENDING_APPROVAL"
    );
  }

  if (business.status === "rejected") {
    const latestRejection = await prisma.businessRejection.findFirst({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    });
    const message = latestRejection?.reason
      ? `Business rejected: ${latestRejection.reason}`
      : "Your business profile was rejected. Update and resubmit to continue.";

    return sendError(res, message, 403, "BUSINESS_REJECTED");
  }

  if (business.status === "archived") {
    return sendError(
      res,
      "This business is archived. Restore it to continue.",
      403,
      "BUSINESS_ARCHIVED"
    );
  }

  if ((business as any).blocked) {
    return sendError(res, "This business is blocked by admin", 403, "BUSINESS_BLOCKED");
  }

  req.business = {
    id: business.id,
    userId: business.userId,
    status: business.status,
  };

  return next();
};
