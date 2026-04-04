import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type {
  AnalyticsWindow,
  AnalyticsWindowResult,
  AnalyticsWindowSummary,
  AnalyticsSeriesPoint,
} from "@scan2serve/shared";
import { queryClickhouse, getClickhouseDatabase } from "./clickhouseClient";

const postgresWindows: AnalyticsWindow[] = ["today", "yesterday", "currentWeek"];
const warehouseWindows: AnalyticsWindow[] = ["lastWeek", "lastMonth", "lastQuarter", "lastYear"];

type SummaryRow = {
  order_count: number;
  cancelled_count: number;
  paid_order_count: number;
  unpaid_cash_count: number;
  paid_revenue: string;
  avg_paid_order_value: string;
};

type SeriesRow = {
  bucket_start: Date;
  order_count: number;
  paid_revenue: string;
};

const toSummary = (row?: SummaryRow | null): AnalyticsWindowSummary => ({
  orderCount: Number(row?.order_count ?? 0),
  cancelledCount: Number(row?.cancelled_count ?? 0),
  paidOrderCount: Number(row?.paid_order_count ?? 0),
  unpaidCashCount: Number(row?.unpaid_cash_count ?? 0),
  paidRevenue: row?.paid_revenue ?? "0",
  avgPaidOrderValue: row?.avg_paid_order_value ?? "0",
});

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

export const fetchPostgresOverviewWindow = async (
  businessId: string,
  timezone: string,
  window: AnalyticsWindow
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
      COUNT(*) FILTER (
        WHERE payment_method = 'cash' AND payment_status = 'unpaid'
      )::int AS unpaid_cash_count,
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

  return {
    window,
    source: "postgres",
    status: "ok",
    summary: toSummary(summaryRows[0]),
    series: toSeries(seriesRows),
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

export const fetchWarehouseOverviewWindow = async (
  businessId: string,
  timezone: string,
  window: AnalyticsWindow
): Promise<AnalyticsWindowResult> => {
  const queryUser = process.env.CLICKHOUSE_QUERY_USER || process.env.CLICKHOUSE_USER || "default";
  const queryPassword = process.env.CLICKHOUSE_QUERY_PASSWORD || process.env.CLICKHOUSE_PASSWORD || "";
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
      0 AS unpaid_cash_count,
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

  return {
    window,
    source: "warehouse",
    status: "ok",
    summary: toSummary({
      order_count: Number(summaryRow.order_count ?? 0),
      cancelled_count: Number(summaryRow.cancelled_count ?? 0),
      paid_order_count: Number(summaryRow.paid_order_count ?? 0),
      unpaid_cash_count: Number(summaryRow.unpaid_cash_count ?? 0),
      paid_revenue: String(summaryRow.paid_revenue ?? 0),
      avg_paid_order_value: String(summaryRow.avg_paid_order_value ?? 0),
    }),
    series,
  };
};
