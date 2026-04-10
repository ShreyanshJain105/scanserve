import express from "express";
import { z } from "zod";
import type {
  AnalyticsSectionResponse,
  AnalyticsSection,
  AnalyticsWindow,
  AnalyticsWindowResult,
  AnalyticsGranularity,
} from "@scan2serve/shared";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireApprovedBusiness } from "../middleware/businessApproval";
import {
  fetchPostgresDashboardWindow,
  fetchWarehouseDashboardWindow,
  fetchPostgresOrdersWindow,
  fetchWarehouseOrdersWindow,
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
  granularity: z.enum(["summary", "detail"]).default("summary"),
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

const buildSectionHandler = (section: AnalyticsSection) =>
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

    const granularity = parsed.data.granularity ?? "summary";

    const response: AnalyticsSectionResponse = {
      section,
      timezone,
      granularity: granularity as AnalyticsGranularity,
      windows: {},
    };

    for (const window of windows) {
      const shouldCache = window !== "today";
      const cacheKey = shouldCache
        ? buildAnalyticsCacheKey([
            parsed.data.source,
            section,
            granularity,
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
          section === "dashboard"
            ? parsed.data.source === "postgres"
              ? await fetchPostgresDashboardWindow(
                  req.business!.id,
                  timezone,
                  window,
                  granularity
                )
              : await fetchWarehouseDashboardWindow(
                  req.business!.id,
                  timezone,
                  window,
                  granularity
                )
            : parsed.data.source === "postgres"
              ? await fetchPostgresOrdersWindow(
                  req.business!.id,
                  timezone,
                  window,
                  granularity
                )
              : await fetchWarehouseOrdersWindow(
                  req.business!.id,
                  timezone,
                  window,
                  granularity
                );

        response.windows[window] = result;
        if (cacheKey) {
          await setAnalyticsCache(cacheKey, result);
        }
      } catch (error) {
        const fallback: AnalyticsWindowResult = {
          window: window as AnalyticsWindow,
          source: parsed.data.source,
          status: "error",
          summary:
            granularity === "summary"
              ? section === "dashboard"
                ? {
                    totalOrders: 0,
                    paidRevenue: "0",
                    avgPaidOrderValue: "0",
                    orderGrowthPct: null,
                  }
                : {
                    statusCounts: {},
                    avgPrepMinutes: null,
                    cancellationRatePct: null,
                    paidOrderCount: 0,
                    unpaidOrderCount: 0,
                  }
              : undefined,
          detail:
            granularity === "detail"
              ? section === "dashboard"
                ? {
                    ordersSeries: [],
                    revenueSeries: [],
                    newVsReturning: null,
                    ordersPerActiveTable: null,
                    topCategories: [],
                    topItems: [],
                  }
                : {
                    statusSeries: {},
                    statusLatencyMinutes: null,
                    peakHours: [],
                    paymentMethodMix: [],
                    failedPaymentCount: null,
                    refundedCount: null,
                  }
              : undefined,
          error: error instanceof Error ? error.message : "Analytics source unavailable",
        };
        response.windows[window] = fallback;
      }
    }

    sendSuccess(res, response);
  });

router.post("/dashboard", requireApprovedBusiness, buildSectionHandler("dashboard"));
router.post("/orders", requireApprovedBusiness, buildSectionHandler("orders"));
router.post("/overview", requireApprovedBusiness, buildSectionHandler("dashboard"));

export default router;
