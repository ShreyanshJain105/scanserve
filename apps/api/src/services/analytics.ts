import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type {
  AnalyticsWindow,
  AnalyticsWindowResult,
  AnalyticsSeriesPoint,
  AnalyticsGranularity,
  DashboardAnalyticsSummary,
  DashboardAnalyticsDetail,
  ReviewAnalyticsSummary,
  ReviewAnalyticsDetail,
  ReviewSeriesPoint,
  OrdersAnalyticsSummary,
  OrdersAnalyticsDetail,
  OrderStatus,
  PaymentMethod,
} from "@scan2serve/shared";
import { queryClickhouse, getClickhouseDatabase } from "./clickhouseClient";

const postgresWindows: AnalyticsWindow[] = ["today", "yesterday", "currentWeek"];
const warehouseWindows: AnalyticsWindow[] = ["lastWeek", "lastMonth", "lastQuarter", "lastYear"];

type SummaryRow = {
  order_count: number;
  cancelled_count: number;
  paid_order_count: number;
  unpaid_order_count: number;
  paid_revenue: string;
  avg_paid_order_value: string;
};

type PrevSummaryRow = {
  order_count: number;
  paid_revenue: string;
};

type StatusCountRow = {
  status: OrderStatus;
  count: number;
};

type StatusSeriesRow = {
  bucket_start: Date;
  status: OrderStatus;
  order_count: number;
  paid_revenue: string;
};

type PeakHourRow = {
  hour: number;
  order_count: number;
};

type PaymentMixRow = {
  payment_method: PaymentMethod;
  order_count: number;
  paid_revenue: string;
};

type SeriesRow = {
  bucket_start: Date;
  order_count: number;
  paid_revenue: string;
};

type TopCategoryRow = {
  category_id: string;
  name: string;
  paid_revenue: string;
  order_count: number;
};

type TopItemRow = {
  item_id: string;
  name: string;
  paid_revenue: string;
  order_count: number;
};

type ItemCountRow = {
  item_count: number;
  order_count: number;
};

type CustomerShareRow = {
  new_customers: number;
  returning_customers: number;
};

type PaymentFailureRow = {
  failed_count: number;
  refunded_count: number;
};

type ReviewSummaryRow = {
  total_reviews: number;
  avg_rating: number | null;
  likes_total: number;
};

type ReviewRatingCountRow = {
  rating: number;
  count: number;
};

type ReviewSeriesRow = {
  bucket_start: Date;
  review_count: number;
  avg_rating: number | null;
};

type ReviewConversionRow = {
  review_count: number;
  completed_orders: number;
};

const toSeries = (rows: SeriesRow[]): AnalyticsSeriesPoint[] =>
  rows.map((row) => ({
    bucketStart: row.bucket_start.toISOString(),
    orderCount: Number(row.order_count ?? 0),
    paidRevenue: row.paid_revenue ?? "0",
  }));

const buildPostgresBounds = (window: AnalyticsWindow, timezone: string) => {
  const startOfTodayLocal = Prisma.sql`date_trunc('day', timezone(${timezone}, now()))`;
  const startOfWeekLocal = Prisma.sql`date_trunc('week', timezone(${timezone}, now()))`;

  const startTodayUtc = Prisma.sql`(${startOfTodayLocal} AT TIME ZONE ${timezone})`;
  const startWeekUtc = Prisma.sql`(${startOfWeekLocal} AT TIME ZONE ${timezone})`;

  switch (window) {
    case "today":
      return {
        startUtc: startTodayUtc,
        endUtc: Prisma.sql`(${startTodayUtc} + interval '1 day')`,
        bucket: "hour" as const,
      };
    case "yesterday":
      return {
        startUtc: Prisma.sql`(${startTodayUtc} - interval '1 day')`,
        endUtc: startTodayUtc,
        bucket: "hour" as const,
      };
    case "currentWeek":
      return {
        startUtc: startWeekUtc,
        endUtc: startTodayUtc,
        bucket: "day" as const,
      };
    default:
      throw new Error(`Unsupported postgres window: ${window}`);
  }
};

const buildWarehousePostgresBounds = (window: AnalyticsWindow, timezone: string) => {
  const startOfWeekLocal = Prisma.sql`date_trunc('week', timezone(${timezone}, now()))`;
  const startOfMonthLocal = Prisma.sql`date_trunc('month', timezone(${timezone}, now()))`;
  const startOfQuarterLocal = Prisma.sql`date_trunc('quarter', timezone(${timezone}, now()))`;
  const startOfYearLocal = Prisma.sql`date_trunc('year', timezone(${timezone}, now()))`;

  switch (window) {
    case "lastWeek":
      return {
        startUtc: Prisma.sql`((${startOfWeekLocal} - interval '1 week') AT TIME ZONE ${timezone})`,
        endUtc: Prisma.sql`(${startOfWeekLocal} AT TIME ZONE ${timezone})`,
        bucket: "day" as const,
      };
    case "lastMonth":
      return {
        startUtc: Prisma.sql`((${startOfMonthLocal} - interval '1 month') AT TIME ZONE ${timezone})`,
        endUtc: Prisma.sql`(${startOfMonthLocal} AT TIME ZONE ${timezone})`,
        bucket: "day" as const,
      };
    case "lastQuarter":
      return {
        startUtc: Prisma.sql`((${startOfQuarterLocal} - interval '3 month') AT TIME ZONE ${timezone})`,
        endUtc: Prisma.sql`(${startOfQuarterLocal} AT TIME ZONE ${timezone})`,
        bucket: "day" as const,
      };
    case "lastYear":
      return {
        startUtc: Prisma.sql`((${startOfYearLocal} - interval '1 year') AT TIME ZONE ${timezone})`,
        endUtc: Prisma.sql`(${startOfYearLocal} AT TIME ZONE ${timezone})`,
        bucket: "day" as const,
      };
    default:
      throw new Error(`Unsupported warehouse window: ${window}`);
  }
};

export const getPostgresWindows = (windows?: AnalyticsWindow[]) =>
  windows ? windows.filter((window) => postgresWindows.includes(window)) : postgresWindows;

export const getWarehouseWindows = (windows?: AnalyticsWindow[]) =>
  windows ? windows.filter((window) => warehouseWindows.includes(window)) : warehouseWindows;

const buildDashboardSummary = (
  row?: SummaryRow | null,
  prevOrderCount?: number | null,
  prevPaidRevenue?: string | number | null,
  avgItemsPerOrder?: number | null,
  reviewSummary?: ReviewAnalyticsSummary | null
): DashboardAnalyticsSummary => {
  const totalOrders = Number(row?.order_count ?? 0);
  const prev = prevOrderCount ?? 0;
  const orderGrowthPct = prev > 0 ? ((totalOrders - prev) / prev) * 100 : null;
  const paidRevenue = Number(row?.paid_revenue ?? 0);
  const prevRevenue = Number(prevPaidRevenue ?? 0);
  const revenueGrowthPct = prevRevenue > 0 ? ((paidRevenue - prevRevenue) / prevRevenue) * 100 : null;
  return {
    totalOrders,
    paidRevenue: row?.paid_revenue ?? "0",
    avgPaidOrderValue: row?.avg_paid_order_value ?? "0",
    orderGrowthPct,
    revenueGrowthPct,
    avgItemsPerOrder: avgItemsPerOrder ?? null,
    reviews: reviewSummary ?? undefined,
  };
};

const buildDashboardDetail = (
  series: AnalyticsSeriesPoint[],
  activeTableCount: number | null,
  reviewDetail?: ReviewAnalyticsDetail | null
): DashboardAnalyticsDetail => ({
  ordersSeries: series,
  revenueSeries: series,
  newVsReturning: null,
  ordersPerActiveTable:
    activeTableCount && activeTableCount > 0
      ? Number(series.reduce((sum, point) => sum + point.orderCount, 0)) / activeTableCount
      : null,
  topCategories: [],
  topItems: [],
  reviews: reviewDetail ?? undefined,
});

const buildOrdersSummary = (
  row: SummaryRow | null | undefined,
  statusRows: StatusCountRow[]
): OrdersAnalyticsSummary => {
  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  statusRows.forEach((item) => {
    statusCounts[item.status] = Number(item.count ?? 0);
  });
  const totalOrders = Number(row?.order_count ?? 0);
  const cancelledCount = Number(row?.cancelled_count ?? 0);
  const cancellationRatePct = totalOrders > 0 ? (cancelledCount / totalOrders) * 100 : null;
  return {
    statusCounts,
    avgPrepMinutes: null,
    cancellationRatePct,
    paidOrderCount: Number(row?.paid_order_count ?? 0),
    unpaidOrderCount: Number(row?.unpaid_order_count ?? 0),
  };
};

const buildOrdersDetail = (
  statusSeriesRows: StatusSeriesRow[],
  peakHours: PeakHourRow[],
  paymentMix: PaymentMixRow[],
  failedPaymentCount?: number | null,
  refundedCount?: number | null
): OrdersAnalyticsDetail => {
  const statusSeries: Partial<Record<OrderStatus, AnalyticsSeriesPoint[]>> = {};
  statusSeriesRows.forEach((row) => {
    if (!statusSeries[row.status]) {
      statusSeries[row.status] = [];
    }
    statusSeries[row.status]!.push({
      bucketStart: row.bucket_start.toISOString(),
      orderCount: Number(row.order_count ?? 0),
      paidRevenue: row.paid_revenue ?? "0",
    });
  });
  return {
    statusSeries,
    statusLatencyMinutes: null,
    peakHours: peakHours.map((row) => ({
      hour: Number(row.hour ?? 0),
      orderCount: Number(row.order_count ?? 0),
    })),
    paymentMethodMix: paymentMix.map((row) => ({
      method: row.payment_method,
      orderCount: Number(row.order_count ?? 0),
      paidRevenue: row.paid_revenue ?? "0",
    })),
    failedPaymentCount: failedPaymentCount ?? null,
    refundedCount: refundedCount ?? null,
  };
};

const buildReviewCounts = () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
  1 | 2 | 3 | 4 | 5,
  number
>);

const buildReviewSummary = (
  summary: ReviewSummaryRow | null | undefined,
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>,
  conversion: ReviewConversionRow | null | undefined
): ReviewAnalyticsSummary => {
  const totalReviews = Number(summary?.total_reviews ?? 0);
  const avgRating = Number(summary?.avg_rating ?? 0);
  const likesTotal = Number(summary?.likes_total ?? 0);
  const likesPerReview = totalReviews > 0 ? likesTotal / totalReviews : 0;
  const reviewCount = Number(conversion?.review_count ?? totalReviews);
  const completedOrders = Number(conversion?.completed_orders ?? 0);
  const reviewConversionPct =
    completedOrders > 0 ? (reviewCount / completedOrders) * 100 : null;
  return {
    averageRating: totalReviews > 0 ? Number(avgRating.toFixed(2)) : 0,
    totalReviews,
    likesTotal,
    likesPerReview: Number(likesPerReview.toFixed(2)),
    reviewConversionPct,
    ratingCounts,
  };
};

const buildReviewDetail = (
  seriesRows: ReviewSeriesRow[],
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>
): ReviewAnalyticsDetail => ({
  series: seriesRows.map((row) => ({
    bucketStart: row.bucket_start.toISOString(),
    reviewCount: Number(row.review_count ?? 0),
    averageRating: Number((row.avg_rating ?? 0).toFixed(2)),
  })),
  ratingCounts,
});

const sanitizeClickhouseValue = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const buildClickhouseIdExclusion = (ids: string[], column: string) => {
  if (!ids.length) return "";
  const values = ids.map((id) => `'${sanitizeClickhouseValue(id)}'`).join(",");
  return `AND ${column} NOT IN (${values})`;
};

const mergeReviewSeries = (
  pgSeries: ReviewSeriesPoint[],
  chSeries: ReviewSeriesPoint[]
): ReviewSeriesPoint[] => {
  const map = new Map<string, { count: number; ratingTotal: number }>();
  const addSeries = (series: ReviewSeriesPoint[]) => {
    series.forEach((point) => {
      const existing = map.get(point.bucketStart) ?? { count: 0, ratingTotal: 0 };
      const nextCount = existing.count + point.reviewCount;
      const nextRatingTotal =
        existing.ratingTotal + point.averageRating * point.reviewCount;
      map.set(point.bucketStart, { count: nextCount, ratingTotal: nextRatingTotal });
    });
  };
  addSeries(pgSeries);
  addSeries(chSeries);

  return Array.from(map.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([bucketStart, value]) => ({
      bucketStart,
      reviewCount: value.count,
      averageRating:
        value.count > 0 ? Number((value.ratingTotal / value.count).toFixed(2)) : 0,
    }));
};

export const fetchPostgresDashboardWindow = async (
  businessId: string,
  timezone: string,
  window: AnalyticsWindow,
  granularity: AnalyticsGranularity
): Promise<AnalyticsWindowResult> => {
  const { startUtc, endUtc, bucket } = buildPostgresBounds(window, timezone);
  const prevStartUtc = Prisma.sql`(${startUtc} - (${endUtc} - ${startUtc}))`;
  const prevEndUtc = startUtc;
  const summaryRows = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      COUNT(*) FILTER (WHERE status != 'cancelled')::int AS order_count,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_order_count,
      COUNT(*) FILTER (WHERE payment_status != 'paid')::int AS unpaid_order_count,
      COALESCE(
        SUM(total_amount) FILTER (WHERE payment_status = 'paid'),
        0
      )::text AS paid_revenue,
      COALESCE(
        (
          SUM(total_amount) FILTER (WHERE payment_status = 'paid')
          / NULLIF(COUNT(*) FILTER (WHERE payment_status = 'paid'), 0)
        ),
        0
      )::text AS avg_paid_order_value
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
  `);

  const prevRows = await prisma.$queryRaw<PrevSummaryRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${prevStartUtc} AS start_utc, ${prevEndUtc} AS end_utc
    )
    SELECT
      COUNT(*) FILTER (WHERE status != 'cancelled')::int AS order_count,
      COALESCE(
        SUM(total_amount) FILTER (WHERE payment_status = 'paid'),
        0
      )::text AS paid_revenue
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
  `);

  const itemCountRows = await prisma.$queryRaw<ItemCountRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      COALESCE(SUM(order_items.quantity), 0)::int AS item_count,
      COUNT(DISTINCT orders.id) FILTER (WHERE orders.status != 'cancelled')::int AS order_count
    FROM orders
    JOIN order_items
      ON order_items.order_id = orders.id
      AND order_items.order_created_at = orders.created_at
    WHERE orders.business_id = ${businessId}
      AND (orders.created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (orders.created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
  `);

  const customerShareRows = await prisma.$queryRaw<CustomerShareRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    ),
    window_customers AS (
      SELECT DISTINCT customer_user_id
      FROM orders
      WHERE business_id = ${businessId}
        AND customer_user_id IS NOT NULL
        AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
        AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    ),
    first_orders AS (
      SELECT customer_user_id, MIN(created_at AT TIME ZONE 'UTC') AS first_order_at
      FROM orders
      WHERE business_id = ${businessId}
        AND customer_user_id IS NOT NULL
      GROUP BY customer_user_id
    )
    SELECT
      COUNT(*) FILTER (
        WHERE first_order_at >= (SELECT start_utc FROM bounds)
          AND first_order_at < (SELECT end_utc FROM bounds)
      )::int AS new_customers,
      COUNT(*) FILTER (
        WHERE first_order_at < (SELECT start_utc FROM bounds)
      )::int AS returning_customers
    FROM first_orders
    WHERE customer_user_id IN (SELECT customer_user_id FROM window_customers)
  `);

  const seriesRows = await prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      (${bucket === "hour"
        ? Prisma.sql`date_trunc('hour', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`
        : Prisma.sql`date_trunc('day', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`}
        AT TIME ZONE ${timezone}) AS bucket_start,
      COUNT(*) FILTER (WHERE status != 'cancelled')::int AS order_count,
      COALESCE(
        SUM(total_amount) FILTER (WHERE payment_status = 'paid'),
        0
      )::text AS paid_revenue
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY bucket_start
    ORDER BY bucket_start
  `);

  const topCategoryRows = await prisma.$queryRaw<TopCategoryRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      categories.id::text AS category_id,
      categories.name AS name,
      COALESCE(SUM(order_items.unit_price * order_items.quantity), 0)::text AS paid_revenue,
      COUNT(DISTINCT orders.id)::int AS order_count
    FROM orders
    JOIN order_items
      ON order_items.order_id = orders.id
      AND order_items.order_created_at = orders.created_at
    JOIN menu_items ON menu_items.id = order_items.menu_item_id
    JOIN categories ON categories.id = menu_items.category_id
    WHERE orders.business_id = ${businessId}
      AND orders.payment_status = 'paid'
      AND (orders.created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (orders.created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY categories.id, categories.name
    ORDER BY paid_revenue DESC
    LIMIT 5
  `);

  const topItemRows = await prisma.$queryRaw<TopItemRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      menu_items.id::text AS item_id,
      menu_items.name AS name,
      COALESCE(SUM(order_items.unit_price * order_items.quantity), 0)::text AS paid_revenue,
      COUNT(DISTINCT orders.id)::int AS order_count
    FROM orders
    JOIN order_items
      ON order_items.order_id = orders.id
      AND order_items.order_created_at = orders.created_at
    JOIN menu_items ON menu_items.id = order_items.menu_item_id
    WHERE orders.business_id = ${businessId}
      AND orders.payment_status = 'paid'
      AND (orders.created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (orders.created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY menu_items.id, menu_items.name
    ORDER BY paid_revenue DESC
    LIMIT 5
  `);

  const reviewSummaryRows = await prisma.$queryRaw<ReviewSummaryRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    ),
    review_base AS (
      SELECT id, rating
      FROM reviews
      WHERE business_id = ${businessId}
        AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
        AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    )
    SELECT
      (SELECT COUNT(*)::int FROM review_base) AS total_reviews,
      (SELECT COALESCE(AVG(rating), 0) FROM review_base) AS avg_rating,
      (
        SELECT COUNT(*)::int
        FROM review_likes
        JOIN review_base ON review_base.id = review_likes.review_id
      ) AS likes_total
  `);

  const reviewRatingRows = await prisma.$queryRaw<ReviewRatingCountRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT rating::int AS rating, COUNT(*)::int AS count
    FROM reviews
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY rating
  `);

  const reviewSeriesRows = await prisma.$queryRaw<ReviewSeriesRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      (${bucket === "hour"
        ? Prisma.sql`date_trunc('hour', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`
        : Prisma.sql`date_trunc('day', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`}
        AT TIME ZONE ${timezone}) AS bucket_start,
      COUNT(*)::int AS review_count,
      COALESCE(AVG(rating), 0) AS avg_rating
    FROM reviews
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY bucket_start
    ORDER BY bucket_start
  `);

  const reviewConversionRows = await prisma.$queryRaw<ReviewConversionRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    ),
    review_count AS (
      SELECT COUNT(*)::int AS review_count
      FROM reviews
      WHERE business_id = ${businessId}
        AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
        AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    ),
    completed_orders AS (
      SELECT COUNT(*)::int AS completed_orders
      FROM orders
      WHERE business_id = ${businessId}
        AND status = 'completed'
        AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
        AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    )
    SELECT review_count.review_count, completed_orders.completed_orders
    FROM review_count, completed_orders
  `);

  const series = toSeries(seriesRows);
  const activeTableCount = await prisma.table.count({
    where: { businessId, isActive: true },
  });

  const itemCount = itemCountRows[0]?.item_count ?? 0;
  const itemOrderCount = itemCountRows[0]?.order_count ?? 0;
  const avgItemsPerOrder =
    itemOrderCount > 0 ? Number(itemCount) / Number(itemOrderCount) : null;

  const ratingCounts = buildReviewCounts();
  reviewRatingRows.forEach((row) => {
    const rating = row.rating as 1 | 2 | 3 | 4 | 5;
    if (ratingCounts[rating] !== undefined) {
      ratingCounts[rating] = Number(row.count ?? 0);
    }
  });
  const reviewSummary = buildReviewSummary(
    reviewSummaryRows[0],
    ratingCounts,
    reviewConversionRows[0]
  );

  const summary = buildDashboardSummary(
    summaryRows[0],
    prevRows[0]?.order_count ?? 0,
    prevRows[0]?.paid_revenue ?? "0",
    avgItemsPerOrder,
    reviewSummary
  );
  const newCustomers = customerShareRows[0]?.new_customers ?? 0;
  const returningCustomers = customerShareRows[0]?.returning_customers ?? 0;
  const totalCustomers = newCustomers + returningCustomers;
  const repeatRatePct = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : null;
  const reviewDetail = buildReviewDetail(reviewSeriesRows, ratingCounts);
  const detail = {
    ...buildDashboardDetail(series, activeTableCount, reviewDetail),
    newVsReturning: totalCustomers
      ? {
          newCustomers,
          returningCustomers,
          repeatRatePct,
        }
      : null,
    topCategories: topCategoryRows.map((row) => ({
      categoryId: row.category_id,
      name: row.name,
      paidRevenue: row.paid_revenue ?? "0",
      orderCount: Number(row.order_count ?? 0),
    })),
    topItems: topItemRows.map((row) => ({
      itemId: row.item_id,
      name: row.name,
      paidRevenue: row.paid_revenue ?? "0",
      orderCount: Number(row.order_count ?? 0),
    })),
  };

  return {
    window,
    source: "postgres",
    status: "ok",
    summary: granularity === "summary" ? summary : undefined,
    detail: granularity === "detail" ? detail : undefined,
  };
};

const buildClickhouseBounds = (window: AnalyticsWindow) => {
  switch (window) {
    case "lastWeek":
      return {
        start: "toStartOfWeek(now_local, 1) - INTERVAL 1 WEEK",
        end: "toStartOfWeek(now_local, 1)",
      };
    case "lastMonth":
      return {
        start: "toStartOfMonth(now_local) - INTERVAL 1 MONTH",
        end: "toStartOfMonth(now_local)",
      };
    case "lastQuarter":
      return {
        start: "toStartOfQuarter(now_local) - INTERVAL 1 QUARTER",
        end: "toStartOfQuarter(now_local)",
      };
    case "lastYear":
      return {
        start: "toStartOfYear(now_local) - INTERVAL 1 YEAR",
        end: "toStartOfYear(now_local)",
      };
    default:
      throw new Error(`Unsupported warehouse window: ${window}`);
  }
};

const buildClickhousePrevBounds = (window: AnalyticsWindow) => {
  switch (window) {
    case "lastWeek":
      return {
        start: "toStartOfWeek(now_local, 1) - INTERVAL 2 WEEK",
        end: "toStartOfWeek(now_local, 1) - INTERVAL 1 WEEK",
      };
    case "lastMonth":
      return {
        start: "toStartOfMonth(now_local) - INTERVAL 2 MONTH",
        end: "toStartOfMonth(now_local) - INTERVAL 1 MONTH",
      };
    case "lastQuarter":
      return {
        start: "toStartOfQuarter(now_local) - INTERVAL 2 QUARTER",
        end: "toStartOfQuarter(now_local) - INTERVAL 1 QUARTER",
      };
    case "lastYear":
      return {
        start: "toStartOfYear(now_local) - INTERVAL 2 YEAR",
        end: "toStartOfYear(now_local) - INTERVAL 1 YEAR",
      };
    default:
      throw new Error(`Unsupported warehouse window: ${window}`);
  }
};

export const fetchWarehouseDashboardWindow = async (
  businessId: string,
  timezone: string,
  window: AnalyticsWindow,
  granularity: AnalyticsGranularity
): Promise<AnalyticsWindowResult> => {
  const queryUser = process.env.CLICKHOUSE_QUERY_USER || process.env.CLICKHOUSE_USER || "default";
  const queryPassword =
    process.env.CLICKHOUSE_QUERY_PASSWORD || process.env.CLICKHOUSE_PASSWORD || "";
  const { start, end } = buildClickhouseBounds(window);
  const { start: prevStart, end: prevEnd } = buildClickhousePrevBounds(window);
  const database = getClickhouseDatabase();
  const { startUtc: pgStartUtc, endUtc: pgEndUtc, bucket: pgBucket } =
    buildWarehousePostgresBounds(window, timezone);

  const summaryQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      countIf(event_type = 'order_created') AS order_count,
      countIf(event_type = 'order_status_updated' AND JSONExtractString(payload, 'order', 'status') = 'cancelled') AS cancelled_count,
      countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid') AS paid_order_count,
      0 AS unpaid_order_count,
      sumIf(
        toFloat64OrZero(JSONExtractString(payload, 'order', 'totalAmount')),
        event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid'
      ) AS paid_revenue,
      if(
        countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid') = 0,
        0,
        sumIf(
          toFloat64OrZero(JSONExtractString(payload, 'order', 'totalAmount')),
          event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid'
        )
        / countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid')
      ) AS avg_paid_order_value
    FROM ${database}.order_events
    WHERE business_id = '${businessId}'
      AND toTimeZone(event_created_at, tz) >= start_local
      AND toTimeZone(event_created_at, tz) < end_local
    FORMAT JSON
  `;

  const summaryResponse = await queryClickhouse(summaryQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const summaryRow = (summaryResponse.data?.[0] ?? {}) as SummaryRow;

  const prevCountQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${prevStart} AS start_local,
      ${prevEnd} AS end_local
    SELECT
      countIf(event_type = 'order_created') AS order_count,
      sumIf(
        toFloat64OrZero(JSONExtractString(payload, 'order', 'totalAmount')),
        event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid'
      ) AS paid_revenue
    FROM ${database}.order_events
    WHERE business_id = '${businessId}'
      AND toTimeZone(event_created_at, tz) >= start_local
      AND toTimeZone(event_created_at, tz) < end_local
    FORMAT JSON
  `;

  const prevCountResponse = await queryClickhouse(prevCountQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const prevCountRow = (prevCountResponse.data?.[0] ?? {}) as {
    order_count?: number;
    paid_revenue?: number;
  };

  const seriesQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      formatDateTime(
        toTimeZone(toStartOfDay(toTimeZone(event_created_at, tz)), 'UTC'),
        '%FT%TZ'
      ) AS bucket_start,
      countIf(event_type = 'order_created') AS order_count,
      sumIf(
        toFloat64OrZero(JSONExtractString(payload, 'order', 'totalAmount')),
        event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid'
      ) AS paid_revenue
    FROM ${database}.order_events
    WHERE business_id = '${businessId}'
      AND toTimeZone(event_created_at, tz) >= start_local
      AND toTimeZone(event_created_at, tz) < end_local
    GROUP BY bucket_start
    ORDER BY bucket_start
    FORMAT JSON
  `;

  const seriesResponse = await queryClickhouse(seriesQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const seriesRows = (seriesResponse.data ?? []) as Array<{
    bucket_start: string;
    order_count: number;
    paid_revenue: number;
  }>;

  const series: AnalyticsSeriesPoint[] = seriesRows.map((row) => ({
    bucketStart: row.bucket_start,
    orderCount: Number(row.order_count ?? 0),
    paidRevenue: String(row.paid_revenue ?? 0),
  }));

  const activeTableCount = await prisma.table.count({
    where: { businessId, isActive: true },
  });

  const pgReviewIdRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH bounds AS (
      SELECT ${pgStartUtc} AS start_utc, ${pgEndUtc} AS end_utc
    )
    SELECT id::text AS id
    FROM reviews
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
  `);
  const pgReviewIds = pgReviewIdRows.map((row) => row.id);
  const reviewIdExclusion = buildClickhouseIdExclusion(pgReviewIds, "review_id");

  const pgReviewSummaryRows = await prisma.$queryRaw<ReviewSummaryRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${pgStartUtc} AS start_utc, ${pgEndUtc} AS end_utc
    ),
    review_base AS (
      SELECT id, rating
      FROM reviews
      WHERE business_id = ${businessId}
        AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
        AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    )
    SELECT
      (SELECT COUNT(*)::int FROM review_base) AS total_reviews,
      (SELECT COALESCE(AVG(rating), 0) FROM review_base) AS avg_rating,
      (
        SELECT COUNT(*)::int
        FROM review_likes
        JOIN review_base ON review_base.id = review_likes.review_id
      ) AS likes_total
  `);

  const pgReviewRatingRows = await prisma.$queryRaw<ReviewRatingCountRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${pgStartUtc} AS start_utc, ${pgEndUtc} AS end_utc
    )
    SELECT rating::int AS rating, COUNT(*)::int AS count
    FROM reviews
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY rating
  `);

  const pgReviewSeriesRows = await prisma.$queryRaw<ReviewSeriesRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${pgStartUtc} AS start_utc, ${pgEndUtc} AS end_utc
    )
    SELECT
      (${pgBucket === "hour"
        ? Prisma.sql`date_trunc('hour', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`
        : Prisma.sql`date_trunc('day', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`}
        AT TIME ZONE ${timezone}) AS bucket_start,
      COUNT(*)::int AS review_count,
      COALESCE(AVG(rating), 0) AS avg_rating
    FROM reviews
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY bucket_start
    ORDER BY bucket_start
  `);

  const pgCompletedOrderRows = await prisma.$queryRaw<Array<{ completed_orders: number }>>(
    Prisma.sql`
      WITH bounds AS (
        SELECT ${pgStartUtc} AS start_utc, ${pgEndUtc} AS end_utc
      )
      SELECT COUNT(*)::int AS completed_orders
      FROM orders
      WHERE business_id = ${businessId}
        AND status = 'completed'
        AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
        AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    `
  );

  const pgCompletedOrderIdRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH bounds AS (
      SELECT ${pgStartUtc} AS start_utc, ${pgEndUtc} AS end_utc
    )
    SELECT id::text AS id
    FROM orders
    WHERE business_id = ${businessId}
      AND status = 'completed'
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
  `);
  const pgCompletedOrderIds = pgCompletedOrderIdRows.map((row) => row.id);
  const orderIdExclusion = buildClickhouseIdExclusion(pgCompletedOrderIds, "order_id");

  const reviewSummaryQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      count() AS total_reviews,
      avg(rating) AS avg_rating,
      sum(likes_count) AS likes_total
    FROM ${database}.reviews
    WHERE business_id = '${businessId}'
      AND toTimeZone(created_at, tz) >= start_local
      AND toTimeZone(created_at, tz) < end_local
      ${reviewIdExclusion}
    FORMAT JSON
  `;

  const reviewSummaryResponse = await queryClickhouse(reviewSummaryQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const reviewSummaryRow = (reviewSummaryResponse.data?.[0] ?? {}) as ReviewSummaryRow;

  const reviewRatingQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      rating AS rating,
      count() AS count
    FROM ${database}.reviews
    WHERE business_id = '${businessId}'
      AND toTimeZone(created_at, tz) >= start_local
      AND toTimeZone(created_at, tz) < end_local
      ${reviewIdExclusion}
    GROUP BY rating
    FORMAT JSON
  `;

  const reviewRatingResponse = await queryClickhouse(reviewRatingQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const reviewRatingRows = (reviewRatingResponse.data ?? []) as ReviewRatingCountRow[];

  const reviewSeriesQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      formatDateTime(
        toTimeZone(toStartOfDay(toTimeZone(created_at, tz)), 'UTC'),
        '%FT%TZ'
      ) AS bucket_start,
      count() AS review_count,
      avg(rating) AS avg_rating
    FROM ${database}.reviews
    WHERE business_id = '${businessId}'
      AND toTimeZone(created_at, tz) >= start_local
      AND toTimeZone(created_at, tz) < end_local
      ${reviewIdExclusion}
    GROUP BY bucket_start
    ORDER BY bucket_start
    FORMAT JSON
  `;

  const reviewSeriesResponse = await queryClickhouse(reviewSeriesQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const reviewSeriesRows = (reviewSeriesResponse.data ?? []) as Array<{
    bucket_start: string;
    review_count: number;
    avg_rating: number;
  }>;

  const reviewConversionQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      countIf(event_type = 'order_status_updated' AND JSONExtractString(payload, 'order', 'status') = 'completed') AS completed_orders
    FROM ${database}.order_events
    WHERE business_id = '${businessId}'
      AND toTimeZone(event_created_at, tz) >= start_local
      AND toTimeZone(event_created_at, tz) < end_local
      ${orderIdExclusion}
    FORMAT JSON
  `;

  const reviewConversionResponse = await queryClickhouse(reviewConversionQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const reviewConversionRow = (reviewConversionResponse.data?.[0] ?? {}) as {
    completed_orders?: number;
  };

  const ratingCounts = buildReviewCounts();
  reviewRatingRows.forEach((row) => {
    const rating = row.rating as 1 | 2 | 3 | 4 | 5;
    if (ratingCounts[rating] !== undefined) {
      ratingCounts[rating] = Number(row.count ?? 0);
    }
  });
  pgReviewRatingRows.forEach((row) => {
    const rating = row.rating as 1 | 2 | 3 | 4 | 5;
    if (ratingCounts[rating] !== undefined) {
      ratingCounts[rating] += Number(row.count ?? 0);
    }
  });

  const pgSummary = pgReviewSummaryRows[0] ?? {
    total_reviews: 0,
    avg_rating: 0,
    likes_total: 0,
  };
  const chSummary = {
    total_reviews: Number(reviewSummaryRow.total_reviews ?? 0),
    avg_rating: Number(reviewSummaryRow.avg_rating ?? 0),
    likes_total: Number(reviewSummaryRow.likes_total ?? 0),
  };
  const combinedTotal = Number(pgSummary.total_reviews ?? 0) + chSummary.total_reviews;
  const combinedAvg =
    combinedTotal > 0
      ? ((Number(pgSummary.avg_rating ?? 0) * Number(pgSummary.total_reviews ?? 0) +
          chSummary.avg_rating * chSummary.total_reviews) /
          combinedTotal)
      : 0;
  const combinedLikes = Number(pgSummary.likes_total ?? 0) + chSummary.likes_total;
  const completedOrders =
    Number(pgCompletedOrderRows[0]?.completed_orders ?? 0) +
    Number(reviewConversionRow.completed_orders ?? 0);

  const reviewSummary = buildReviewSummary(
    {
      total_reviews: combinedTotal,
      avg_rating: combinedAvg,
      likes_total: combinedLikes,
    },
    ratingCounts,
    {
      review_count: combinedTotal,
      completed_orders: completedOrders,
    }
  );

  const pgSeries = buildReviewDetail(pgReviewSeriesRows, ratingCounts).series;
  const chSeries = buildReviewDetail(
    reviewSeriesRows.map((row) => ({
      bucket_start: new Date(row.bucket_start),
      review_count: Number(row.review_count ?? 0),
      avg_rating: Number(row.avg_rating ?? 0),
    })),
    ratingCounts
  ).series;
  const reviewDetail: ReviewAnalyticsDetail = {
    series: mergeReviewSeries(pgSeries, chSeries),
    ratingCounts,
  };

  const summary = buildDashboardSummary(
    {
      order_count: Number(summaryRow.order_count ?? 0),
      cancelled_count: Number(summaryRow.cancelled_count ?? 0),
      paid_order_count: Number(summaryRow.paid_order_count ?? 0),
      unpaid_order_count: 0,
      paid_revenue: String(summaryRow.paid_revenue ?? 0),
      avg_paid_order_value: String(summaryRow.avg_paid_order_value ?? 0),
    },
    Number(prevCountRow.order_count ?? 0),
    String(prevCountRow.paid_revenue ?? 0),
    null,
    reviewSummary
  );

  const detail = buildDashboardDetail(series, activeTableCount, reviewDetail);

  return {
    window,
    source: "warehouse",
    status: "ok",
    summary: granularity === "summary" ? summary : undefined,
    detail: granularity === "detail" ? detail : undefined,
  };
};

export const fetchPostgresOrdersWindow = async (
  businessId: string,
  timezone: string,
  window: AnalyticsWindow,
  granularity: AnalyticsGranularity
): Promise<AnalyticsWindowResult> => {
  const { startUtc, endUtc, bucket } = buildPostgresBounds(window, timezone);
  const summaryRows = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      COUNT(*) FILTER (WHERE status != 'cancelled')::int AS order_count,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_order_count,
      COUNT(*) FILTER (WHERE payment_status != 'paid')::int AS unpaid_order_count,
      COALESCE(
        SUM(total_amount) FILTER (WHERE payment_status = 'paid'),
        0
      )::text AS paid_revenue,
      COALESCE(
        (
          SUM(total_amount) FILTER (WHERE payment_status = 'paid')
          / NULLIF(COUNT(*) FILTER (WHERE payment_status = 'paid'), 0)
        ),
        0
      )::text AS avg_paid_order_value
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
  `);

  const statusRows = await prisma.$queryRaw<StatusCountRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT status::text AS status, COUNT(*)::int AS count
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY status
  `);

  const statusSeriesRows = await prisma.$queryRaw<StatusSeriesRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      (${bucket === "hour"
        ? Prisma.sql`date_trunc('hour', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`
        : Prisma.sql`date_trunc('day', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`}
        AT TIME ZONE ${timezone}) AS bucket_start,
      status::text AS status,
      COUNT(*)::int AS order_count,
      COALESCE(
        SUM(total_amount) FILTER (WHERE payment_status = 'paid'),
        0
      )::text AS paid_revenue
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY bucket_start, status
    ORDER BY bucket_start
  `);

  const peakHourRows = await prisma.$queryRaw<PeakHourRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      EXTRACT(hour FROM (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::int AS hour,
      COUNT(*)::int AS order_count
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY hour
    ORDER BY hour
  `);

  const paymentMixRows = await prisma.$queryRaw<PaymentMixRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      payment_method::text AS payment_method,
      COUNT(*)::int AS order_count,
      COALESCE(
        SUM(total_amount) FILTER (WHERE payment_status = 'paid'),
        0
      )::text AS paid_revenue
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
    GROUP BY payment_method
  `);

  const paymentFailureRows = await prisma.$queryRaw<PaymentFailureRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startUtc} AS start_utc, ${endUtc} AS end_utc
    )
    SELECT
      COUNT(*) FILTER (WHERE payment_status = 'failed')::int AS failed_count,
      COUNT(*) FILTER (WHERE payment_status = 'refunded')::int AS refunded_count
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
  `);

  const summary = buildOrdersSummary(summaryRows[0], statusRows);
  const detail = buildOrdersDetail(
    statusSeriesRows,
    peakHourRows,
    paymentMixRows,
    paymentFailureRows[0]?.failed_count ?? 0,
    paymentFailureRows[0]?.refunded_count ?? 0
  );

  return {
    window,
    source: "postgres",
    status: "ok",
    summary: granularity === "summary" ? summary : undefined,
    detail: granularity === "detail" ? detail : undefined,
  };
};

export const fetchWarehouseOrdersWindow = async (
  businessId: string,
  timezone: string,
  window: AnalyticsWindow,
  granularity: AnalyticsGranularity
): Promise<AnalyticsWindowResult> => {
  const queryUser = process.env.CLICKHOUSE_QUERY_USER || process.env.CLICKHOUSE_USER || "default";
  const queryPassword =
    process.env.CLICKHOUSE_QUERY_PASSWORD || process.env.CLICKHOUSE_PASSWORD || "";
  const { start, end } = buildClickhouseBounds(window);
  const database = getClickhouseDatabase();

  const summaryQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      countIf(event_type = 'order_created') AS order_count,
      countIf(event_type = 'order_status_updated' AND JSONExtractString(payload, 'order', 'status') = 'cancelled') AS cancelled_count,
      countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid') AS paid_order_count,
      0 AS unpaid_order_count,
      sumIf(
        toFloat64OrZero(JSONExtractString(payload, 'order', 'totalAmount')),
        event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid'
      ) AS paid_revenue,
      if(
        countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid') = 0,
        0,
        sumIf(
          toFloat64OrZero(JSONExtractString(payload, 'order', 'totalAmount')),
          event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid'
        )
        / countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid')
      ) AS avg_paid_order_value
    FROM ${database}.order_events
    WHERE business_id = '${businessId}'
      AND toTimeZone(event_created_at, tz) >= start_local
      AND toTimeZone(event_created_at, tz) < end_local
    FORMAT JSON
  `;

  const summaryResponse = await queryClickhouse(summaryQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const summaryRow = (summaryResponse.data?.[0] ?? {}) as SummaryRow;

  const statusCountsQuery = `
    WITH
      '${timezone}' AS tz,
      toTimeZone(now(), tz) AS now_local,
      ${start} AS start_local,
      ${end} AS end_local
    SELECT
      JSONExtractString(payload, 'order', 'status') AS status,
      countIf(event_type = 'order_status_updated') AS count
    FROM ${database}.order_events
    WHERE business_id = '${businessId}'
      AND toTimeZone(event_created_at, tz) >= start_local
      AND toTimeZone(event_created_at, tz) < end_local
      AND event_type = 'order_status_updated'
    GROUP BY status
    FORMAT JSON
  `;

  const statusResponse = await queryClickhouse(statusCountsQuery, {
    user: queryUser,
    password: queryPassword,
  });
  const statusRows = (statusResponse.data ?? []) as StatusCountRow[];

  const summary = buildOrdersSummary(
    {
      order_count: Number(summaryRow.order_count ?? 0),
      cancelled_count: Number(summaryRow.cancelled_count ?? 0),
      paid_order_count: Number(summaryRow.paid_order_count ?? 0),
      unpaid_order_count: 0,
      paid_revenue: String(summaryRow.paid_revenue ?? 0),
      avg_paid_order_value: String(summaryRow.avg_paid_order_value ?? 0),
    },
    statusRows
  );

  let detail: OrdersAnalyticsDetail | null = null;

  if (granularity === "detail") {
    const statusSeriesQuery = `
      WITH
        '${timezone}' AS tz,
        toTimeZone(now(), tz) AS now_local,
        ${start} AS start_local,
        ${end} AS end_local
      SELECT
        formatDateTime(
          toTimeZone(toStartOfDay(toTimeZone(event_created_at, tz)), 'UTC'),
          '%FT%TZ'
        ) AS bucket_start,
        JSONExtractString(payload, 'order', 'status') AS status,
        countIf(event_type = 'order_status_updated') AS order_count,
        0 AS paid_revenue
      FROM ${database}.order_events
      WHERE business_id = '${businessId}'
        AND toTimeZone(event_created_at, tz) >= start_local
        AND toTimeZone(event_created_at, tz) < end_local
        AND event_type = 'order_status_updated'
      GROUP BY bucket_start, status
      ORDER BY bucket_start
      FORMAT JSON
    `;

    const statusSeriesResponse = await queryClickhouse(statusSeriesQuery, {
      user: queryUser,
      password: queryPassword,
    });
    const statusSeriesRows = (statusSeriesResponse.data ?? []) as Array<{
      bucket_start: string;
      status: OrderStatus;
      order_count: number;
      paid_revenue: number;
    }>;

    const peakHoursQuery = `
      WITH
        '${timezone}' AS tz,
        toTimeZone(now(), tz) AS now_local,
        ${start} AS start_local,
        ${end} AS end_local
      SELECT
        toHour(toTimeZone(event_created_at, tz)) AS hour,
        countIf(event_type = 'order_created') AS order_count
      FROM ${database}.order_events
      WHERE business_id = '${businessId}'
        AND toTimeZone(event_created_at, tz) >= start_local
        AND toTimeZone(event_created_at, tz) < end_local
        AND event_type = 'order_created'
      GROUP BY hour
      ORDER BY hour
      FORMAT JSON
    `;

    const peakHoursResponse = await queryClickhouse(peakHoursQuery, {
      user: queryUser,
      password: queryPassword,
    });
    const peakHoursRows = (peakHoursResponse.data ?? []) as PeakHourRow[];

    const paymentMixQuery = `
      WITH
        '${timezone}' AS tz,
        toTimeZone(now(), tz) AS now_local,
        ${start} AS start_local,
        ${end} AS end_local
      SELECT
        JSONExtractString(payload, 'order', 'paymentMethod') AS payment_method,
        countIf(event_type = 'order_payment_updated') AS order_count,
        sumIf(
          toFloat64OrZero(JSONExtractString(payload, 'order', 'totalAmount')),
          event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'paid'
        ) AS paid_revenue
      FROM ${database}.order_events
      WHERE business_id = '${businessId}'
        AND toTimeZone(event_created_at, tz) >= start_local
        AND toTimeZone(event_created_at, tz) < end_local
        AND event_type = 'order_payment_updated'
      GROUP BY payment_method
      FORMAT JSON
    `;

    const paymentMixResponse = await queryClickhouse(paymentMixQuery, {
      user: queryUser,
      password: queryPassword,
    });
    const paymentMixRows = (paymentMixResponse.data ?? []) as Array<{
      payment_method: PaymentMethod;
      order_count: number;
      paid_revenue: number;
    }>;

    const paymentFailureQuery = `
      WITH
        '${timezone}' AS tz,
        toTimeZone(now(), tz) AS now_local,
        ${start} AS start_local,
        ${end} AS end_local
      SELECT
        countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'failed') AS failed_count,
        countIf(event_type = 'order_payment_updated' AND JSONExtractString(payload, 'order', 'paymentStatus') = 'refunded') AS refunded_count
      FROM ${database}.order_events
      WHERE business_id = '${businessId}'
        AND toTimeZone(event_created_at, tz) >= start_local
        AND toTimeZone(event_created_at, tz) < end_local
      FORMAT JSON
    `;

    const paymentFailureResponse = await queryClickhouse(paymentFailureQuery, {
      user: queryUser,
      password: queryPassword,
    });
    const paymentFailureRow = (paymentFailureResponse.data?.[0] ?? {}) as PaymentFailureRow;

    detail = buildOrdersDetail(
      statusSeriesRows.map((row) => ({
        bucket_start: new Date(row.bucket_start),
        status: row.status,
        order_count: row.order_count,
        paid_revenue: String(row.paid_revenue ?? 0),
      })),
      peakHoursRows.map((row) => ({
        hour: Number(row.hour ?? 0),
        order_count: Number(row.order_count ?? 0),
      })),
      paymentMixRows.map((row) => ({
        payment_method: row.payment_method,
        order_count: Number(row.order_count ?? 0),
        paid_revenue: String(row.paid_revenue ?? 0),
      })),
      paymentFailureRow.failed_count ?? 0,
      paymentFailureRow.refunded_count ?? 0
    );
  }

  return {
    window,
    source: "warehouse",
    status: "ok",
    summary: granularity === "summary" ? summary : undefined,
    detail:
      granularity === "detail"
        ? detail ?? buildOrdersDetail([], [], [], 0, 0)
        : undefined,
  };
};
