import { execClickhouse, getClickhouseDatabase, queryClickhouse } from "./clickhouseClient";
import { logger } from "../utils/logger";

const ingestUser = process.env.CLICKHOUSE_INGEST_USER || process.env.CLICKHOUSE_USER || "default";
const ingestPassword = process.env.CLICKHOUSE_INGEST_PASSWORD || process.env.CLICKHOUSE_PASSWORD || "";
const queryUser = process.env.CLICKHOUSE_QUERY_USER || process.env.CLICKHOUSE_USER || "default";
const queryPassword = process.env.CLICKHOUSE_QUERY_PASSWORD || process.env.CLICKHOUSE_PASSWORD || "";

export type ReviewWarehouseRow = {
  review_id: string;
  order_id: string;
  business_id: string;
  customer_user_id: string;
  rating: number;
  comment: string | null;
  likes_count: number;
  created_at: string;
};

export type ReviewWarehouseListRow = {
  review_id: string;
  rating: number;
  comment: string | null;
  likes_count: number;
  created_at: string;
};

const formatClickhouseDateTime = (value: Date) =>
  value.toISOString().replace("T", " ").replace("Z", "");

const escapeValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const insertReviewsIntoWarehouse = async (rows: ReviewWarehouseRow[]) => {
  if (rows.length === 0) return;
  const database = getClickhouseDatabase();
  const payload = rows
    .map((row) =>
      JSON.stringify({
        ...row,
        created_at: row.created_at,
        comment: row.comment ?? null,
      })
    )
    .join("\n");

  await execClickhouse(`INSERT INTO ${database}.reviews FORMAT JSONEachRow\n${payload}`, {
    user: ingestUser,
    password: ingestPassword,
  });
};

export const mapReviewRowToWarehouse = ({
  reviewId,
  orderId,
  businessId,
  customerUserId,
  rating,
  comment,
  likesCount,
  createdAt,
}: {
  reviewId: string;
  orderId: string;
  businessId: string;
  customerUserId: string;
  rating: number;
  comment: string | null;
  likesCount: number;
  createdAt: Date;
}): ReviewWarehouseRow => ({
  review_id: reviewId,
  order_id: orderId,
  business_id: businessId,
  customer_user_id: customerUserId,
  rating,
  comment,
  likes_count: likesCount,
  created_at: formatClickhouseDateTime(createdAt),
});

export const fetchWarehouseReviews = async ({
  businessId,
  ratingFilter,
  limit,
}: {
  businessId: string;
  ratingFilter: number | null;
  limit: number;
}) => {
  const database = getClickhouseDatabase();
  const escapedBusinessId = escapeValue(businessId);
  const whereClauses = [`business_id = '${escapedBusinessId}'`];
  if (ratingFilter) {
    whereClauses.push(`rating = ${ratingFilter}`);
  }

  const query = `
    SELECT review_id, rating, comment, likes_count, created_at
    FROM ${database}.reviews
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY likes_count DESC, created_at DESC
    LIMIT ${Math.max(0, limit)}
    FORMAT JSON
  `;

  try {
    const response = (await queryClickhouse(query, {
      user: queryUser,
      password: queryPassword,
    })) as { data?: ReviewWarehouseListRow[] };
    return response.data ?? [];
  } catch (error) {
    logger.warn("reviews.warehouse.query_failed", {
      businessId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

export const fetchWarehouseReviewSummary = async ({
  businessId,
  ratingFilter,
}: {
  businessId: string;
  ratingFilter: number | null;
}) => {
  const database = getClickhouseDatabase();
  const escapedBusinessId = escapeValue(businessId);
  const whereClauses = [`business_id = '${escapedBusinessId}'`];
  if (ratingFilter) {
    whereClauses.push(`rating = ${ratingFilter}`);
  }
  const query = `
    SELECT
      count() AS total_reviews,
      avg(rating) AS avg_rating,
      sum(rating = 1) AS rating_1,
      sum(rating = 2) AS rating_2,
      sum(rating = 3) AS rating_3,
      sum(rating = 4) AS rating_4,
      sum(rating = 5) AS rating_5
    FROM ${database}.reviews
    WHERE ${whereClauses.join(" AND ")}
    FORMAT JSON
  `;

  try {
    const response = (await queryClickhouse(query, {
      user: queryUser,
      password: queryPassword,
    })) as { data?: Array<Record<string, number | null>> };
    const row = response.data?.[0];
    if (!row) {
      return null;
    }
    return {
      total: Number(row.total_reviews ?? 0),
      avg: row.avg_rating ? Number(row.avg_rating) : null,
      ratingCounts: {
        1: Number(row.rating_1 ?? 0),
        2: Number(row.rating_2 ?? 0),
        3: Number(row.rating_3 ?? 0),
        4: Number(row.rating_4 ?? 0),
        5: Number(row.rating_5 ?? 0),
      } as Record<1 | 2 | 3 | 4 | 5, number>,
    };
  } catch (error) {
    logger.warn("reviews.warehouse.summary_failed", {
      businessId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const fetchWarehouseReviewIdsByOrderIds = async (orderIds: string[]) => {
  if (orderIds.length === 0) return new Map<string, string>();
  const database = getClickhouseDatabase();
  const safeIds = orderIds.map((id) => `'${escapeValue(id)}'`).join(", ");
  const query = `
    SELECT order_id, review_id
    FROM ${database}.reviews
    WHERE order_id IN (${safeIds})
    FORMAT JSON
  `;
  try {
    const response = (await queryClickhouse(query, {
      user: queryUser,
      password: queryPassword,
    })) as { data?: Array<{ order_id: string; review_id: string }> };
    const map = new Map<string, string>();
    for (const row of response.data ?? []) {
      map.set(row.order_id, row.review_id);
    }
    return map;
  } catch (error) {
    logger.warn("reviews.warehouse.order_lookup_failed", {
      orderCount: orderIds.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return new Map<string, string>();
  }
};
