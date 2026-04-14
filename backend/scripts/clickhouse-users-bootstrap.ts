import { execClickhouse } from "../src/services/clickhouseClient";

const adminUser = process.env.CLICKHOUSE_BOOTSTRAP_USER || process.env.CLICKHOUSE_USER;
const adminPassword =
  process.env.CLICKHOUSE_BOOTSTRAP_PASSWORD || process.env.CLICKHOUSE_PASSWORD;

const ingestUser = process.env.CLICKHOUSE_INGEST_USER;
const ingestPassword = process.env.CLICKHOUSE_INGEST_PASSWORD;
const queryUser = process.env.CLICKHOUSE_QUERY_USER;
const queryPassword = process.env.CLICKHOUSE_QUERY_PASSWORD;

const requireValue = (value: string | undefined, name: string) => {
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for ClickHouse user bootstrap.`);
  }
  return value.trim();
};

const run = async () => {
  const admin = requireValue(adminUser, "CLICKHOUSE_BOOTSTRAP_USER");
  const adminPass = requireValue(adminPassword, "CLICKHOUSE_BOOTSTRAP_PASSWORD");
  const ingest = requireValue(ingestUser, "CLICKHOUSE_INGEST_USER");
  const ingestPass = requireValue(ingestPassword, "CLICKHOUSE_INGEST_PASSWORD");
  const query = requireValue(queryUser, "CLICKHOUSE_QUERY_USER");
  const queryPass = requireValue(queryPassword, "CLICKHOUSE_QUERY_PASSWORD");

  const auth = { user: admin, password: adminPass };

  await execClickhouse(
    `CREATE USER IF NOT EXISTS ${ingest} IDENTIFIED WITH sha256_password BY '${ingestPass}'`,
    auth
  );
  await execClickhouse(
    `CREATE USER IF NOT EXISTS ${query} IDENTIFIED WITH sha256_password BY '${queryPass}'`,
    auth
  );

  await execClickhouse(`GRANT INSERT, SELECT ON scan2serve.* TO ${ingest}`, auth);
  await execClickhouse(`GRANT SELECT ON scan2serve.* TO ${query}`, auth);

  console.log("ClickHouse users bootstrap complete.");
};

run().catch((error) => {
  console.error("ClickHouse user bootstrap failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
