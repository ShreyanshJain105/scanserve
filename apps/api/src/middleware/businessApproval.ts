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
    return prisma.business.findFirst({
      where: { id: requestedBusinessId, userId: req.user.id },
      orderBy: { updatedAt: "desc" },
    });
  }

  const businesses = await prisma.business.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
  });

  const approved = businesses.find(
    (business: { status: "pending" | "approved" | "rejected" | "archived" }) =>
      business.status === "approved"
  );
  const firstActive = businesses.find(
    (business: { status: "pending" | "approved" | "rejected" | "archived" }) =>
      business.status !== "archived"
  );
  return approved ?? firstActive ?? businesses[0] ?? null;
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
