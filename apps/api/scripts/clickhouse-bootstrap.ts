import { execClickhouse, getClickhouseDatabase } from "../src/services/clickhouseClient";

const database = getClickhouseDatabase();
const bootstrapUser = process.env.CLICKHOUSE_BOOTSTRAP_USER || process.env.CLICKHOUSE_USER;
const bootstrapPassword =
  process.env.CLICKHOUSE_BOOTSTRAP_PASSWORD || process.env.CLICKHOUSE_PASSWORD;

const run = async () => {
  await execClickhouse(`CREATE DATABASE IF NOT EXISTS ${database}`, {
    user: bootstrapUser,
    password: bootstrapPassword,
  });
  await execClickhouse(`
    CREATE TABLE IF NOT EXISTS ${database}.order_events (
      event_id String,
      event_type String,
      event_created_at DateTime,
      order_id String,
      business_id String,
      payload String,
      ingested_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree
    ORDER BY (order_id, event_id)
  `, {
    user: bootstrapUser,
    password: bootstrapPassword,
  });
  // Smoke check
  await execClickhouse(`SELECT 1`, {
    user: bootstrapUser,
    password: bootstrapPassword,
  });
  console.log(`ClickHouse bootstrap complete for database "${database}".`);
};

run().catch((error) => {
  console.error("ClickHouse bootstrap failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
