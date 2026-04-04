import express from "express";
import { z } from "zod";
import type { AnalyticsSectionResponse, AnalyticsWindow, AnalyticsWindowResult } from "@scan2serve/shared";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireApprovedBusiness } from "../middleware/businessApproval";
import {
  fetchPostgresOverviewWindow,
  fetchWarehouseOverviewWindow,
  getPostgresWindows,
  getWarehouseWindows,
} from "../services/analytics";
import { buildAnalyticsCacheKey, getAnalyticsCache, setAnalyticsCache } from "../services/analyticsCache";

const router: express.Router = express.Router();

const analyticsRequestSchema = z.object({
  source: z.enum(["postgres", "warehouse"]),
  windows: z
    .array(
      z.enum([
        "today",
        "yesterday",
        "currentWeek",
        "lastWeek",
        "lastMonth",
        "lastQuarter",
        "lastYear",
      ])
    )
    .optional(),
});

const requireBusinessRole = (
  req: express.Request,
  res: express.Response,
  roles: Array<"owner" | "manager" | "staff">
) => {
  if (!req.businessRole || !roles.includes(req.businessRole)) {
    sendError(res, "You do not have access to analytics for this business", 403, "BUSINESS_ROLE_FORBIDDEN");
    return false;
  }
  return true;
};

router.use(requireAuth, requireRole("business"));

const buildSectionHandler = (section: AnalyticsSectionResponse["section"]) =>
  asyncHandler(async (req, res) => {
    if (!requireBusinessRole(req, res, ["owner", "manager", "staff"])) return;

    const parsed = analyticsRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    const business = await prisma.business.findFirst({
      where: { id: req.business!.id },
      select: { timezone: true },
    });
    const timezone = business?.timezone || "UTC";

    const windows =
      parsed.data.source === "postgres"
        ? getPostgresWindows(parsed.data.windows)
        : getWarehouseWindows(parsed.data.windows);

    const response: AnalyticsSectionResponse = {
      section,
      timezone,
      windows: {},
    };

    for (const window of windows) {
      const shouldCache = window !== "today";
      const cacheKey = shouldCache
        ? buildAnalyticsCacheKey([
            parsed.data.source,
            section,
            req.business!.id,
            timezone,
            window,
          ])
        : null;

      if (cacheKey) {
        const cached = await getAnalyticsCache<AnalyticsWindowResult>(cacheKey);
        if (cached) {
          response.windows[window] = cached;
          continue;
        }
      }

      try {
        const result =
          parsed.data.source === "postgres"
            ? await fetchPostgresOverviewWindow(req.business!.id, timezone, window)
            : await fetchWarehouseOverviewWindow(req.business!.id, timezone, window);

        response.windows[window] = result;
        if (cacheKey) {
          await setAnalyticsCache(cacheKey, result);
        }
      } catch (error) {
        const fallback: AnalyticsWindowResult = {
          window: window as AnalyticsWindow,
          source: parsed.data.source,
          status: "error",
          summary: {
            orderCount: 0,
            cancelledCount: 0,
            paidOrderCount: 0,
            unpaidCashCount: 0,
            paidRevenue: "0",
            avgPaidOrderValue: "0",
          },
          series: [],
          error: error instanceof Error ? error.message : "Analytics source unavailable",
        };
        response.windows[window] = fallback;
      }
    }

    sendSuccess(res, response);
  });

router.post("/overview", requireApprovedBusiness, buildSectionHandler("overview"));
router.post("/orders", requireApprovedBusiness, buildSectionHandler("orders"));
router.post("/revenue", requireApprovedBusiness, buildSectionHandler("revenue"));
router.post("/customers", requireApprovedBusiness, buildSectionHandler("customers"));

export default router;
