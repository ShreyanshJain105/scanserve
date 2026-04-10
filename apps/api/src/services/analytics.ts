import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type {
  AnalyticsWindow,
  AnalyticsWindowResult,
  AnalyticsSeriesPoint,
  AnalyticsGranularity,
  DashboardAnalyticsSummary,
  DashboardAnalyticsDetail,
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

export const getPostgresWindows = (windows?: AnalyticsWindow[]) =>
  windows ? windows.filter((window) => postgresWindows.includes(window)) : postgresWindows;

export const getWarehouseWindows = (windows?: AnalyticsWindow[]) =>
  windows ? windows.filter((window) => warehouseWindows.includes(window)) : warehouseWindows;

const buildDashboardSummary = (
  row?: SummaryRow | null,
  prevOrderCount?: number | null
): DashboardAnalyticsSummary => {
  const totalOrders = Number(row?.order_count ?? 0);
  const prev = prevOrderCount ?? 0;
  const orderGrowthPct = prev > 0 ? ((totalOrders - prev) / prev) * 100 : null;
  return {
    totalOrders,
    paidRevenue: row?.paid_revenue ?? "0",
    avgPaidOrderValue: row?.avg_paid_order_value ?? "0",
    orderGrowthPct,
  };
};

const buildDashboardDetail = (
  series: AnalyticsSeriesPoint[],
  activeTableCount: number | null
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
  paymentMix: PaymentMixRow[]
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
    failedPaymentCount: null,
    refundedCount: null,
  };
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

  const prevRows = await prisma.$queryRaw<Array<{ order_count: number }>>(Prisma.sql`
    WITH bounds AS (
      SELECT ${prevStartUtc} AS start_utc, ${prevEndUtc} AS end_utc
    )
    SELECT
      COUNT(*) FILTER (WHERE status != 'cancelled')::int AS order_count
    FROM orders
    WHERE business_id = ${businessId}
      AND (created_at AT TIME ZONE 'UTC') >= (SELECT start_utc FROM bounds)
      AND (created_at AT TIME ZONE 'UTC') < (SELECT end_utc FROM bounds)
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

  const series = toSeries(seriesRows);
  const activeTableCount = await prisma.table.count({
    where: { businessId, isActive: true },
  });

  const summary = buildDashboardSummary(summaryRows[0], prevRows[0]?.order_count ?? 0);
  const detail = {
    ...buildDashboardDetail(series, activeTableCount),
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
      countIf(event_type = 'order_created') AS order_count
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
  const prevCountRow = (prevCountResponse.data?.[0] ?? {}) as { order_count?: number };

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

  const summary = buildDashboardSummary(
    {
      order_count: Number(summaryRow.order_count ?? 0),
      cancelled_count: Number(summaryRow.cancelled_count ?? 0),
      paid_order_count: Number(summaryRow.paid_order_count ?? 0),
      unpaid_order_count: 0,
      paid_revenue: String(summaryRow.paid_revenue ?? 0),
      avg_paid_order_value: String(summaryRow.avg_paid_order_value ?? 0),
    },
    Number(prevCountRow.order_count ?? 0)
  );

  const detail = buildDashboardDetail(series, activeTableCount);

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

  const summary = buildOrdersSummary(summaryRows[0], statusRows);
  const detail = buildOrdersDetail(statusSeriesRows, peakHourRows, paymentMixRows);

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
      }))
    );
  }

  return {
    window,
    source: "warehouse",
    status: "ok",
    summary: granularity === "summary" ? summary : undefined,
    detail: granularity === "detail" ? detail ?? buildOrdersDetail([], [], []) : undefined,
  };
};
