import { prisma } from "../prisma";
import { logger } from "../utils/logger";

const isPartitionMaintenanceEnabled =
  (process.env.ENABLE_ORDER_PARTITION_MAINTENANCE || "true").toLowerCase() !== "false";
const retentionMonths = Number(process.env.ORDER_PARTITION_RETENTION_MONTHS || 6);
const futureMonths = Number(process.env.ORDER_PARTITION_FUTURE_MONTHS || 2);
const maintenanceIntervalMs = Number(process.env.ORDER_PARTITION_MAINTENANCE_INTERVAL_MS || 12 * 60 * 60 * 1000);

let maintenanceTimer: NodeJS.Timeout | null = null;
let maintenanceInFlight = false;

const tableConfigs = [
  { table: "orders", column: "created_at" },
  { table: "order_items", column: "order_created_at" },
];

const formatMonthKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}_${month}`;
};

const monthStartUtc = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex, 1));

const addMonthsUtc = (date: Date, delta: number) =>
  monthStartUtc(date.getUTCFullYear(), date.getUTCMonth() + delta);

const listMonthsBetween = (start: Date, end: Date) => {
  const months: Date[] = [];
  let cursor = monthStartUtc(start.getUTCFullYear(), start.getUTCMonth());
  const endMonth = monthStartUtc(end.getUTCFullYear(), end.getUTCMonth());
  while (cursor <= endMonth) {
    months.push(cursor);
    cursor = addMonthsUtc(cursor, 1);
  }
  return months;
};

const createPartition = async (table: string, column: string, start: Date, end: Date) => {
  const partitionName = `${table}_p_${formatMonthKey(start)}`;
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS ${partitionName} PARTITION OF ${table} FOR VALUES FROM ('${startIso}') TO ('${endIso}')`
  );
  logger.info("orders.partition.created", { table, partition: partitionName, start: startIso, end: endIso, column });
};

const fetchExistingPartitions = async (table: string) => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ partition: string }>
  >(
    `SELECT c.relname as partition
     FROM pg_inherits
     JOIN pg_class c ON pg_inherits.inhrelid = c.oid
     JOIN pg_class p ON pg_inherits.inhparent = p.oid
     JOIN pg_namespace n ON c.relnamespace = n.oid
     WHERE p.relname = '${table}' AND n.nspname = 'public'`
  );
  return rows.map((row) => row.partition);
};

const dropPartition = async (partitionName: string) => {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${partitionName} CASCADE`);
  logger.info("orders.partition.dropped", { partition: partitionName });
};

const isTablePartitioned = async (table: string) => {
  const rows = await prisma.$queryRawUnsafe<Array<{ isPartitioned: boolean }>>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_partitioned_table pt
       JOIN pg_class c ON pt.partrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'public' AND c.relname = '${table}'
     ) AS "isPartitioned"`
  );
  return rows[0]?.isPartitioned ?? false;
};

const ensurePartitionsForTable = async (table: string, column: string, now: Date) => {
  const partitioned = await isTablePartitioned(table);
  if (!partitioned) {
    logger.warn("orders.partition.table_not_partitioned", { table });
    return;
  }

  const currentMonth = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth());
  const keepFrom = addMonthsUtc(currentMonth, -(retentionMonths - 1));
  const createThrough = addMonthsUtc(currentMonth, futureMonths);

  const monthsToEnsure = listMonthsBetween(keepFrom, createThrough);
  for (const month of monthsToEnsure) {
    const next = addMonthsUtc(month, 1);
    await createPartition(table, column, month, next);
  }

  const existing = await fetchExistingPartitions(table);
  const keepSet = new Set(monthsToEnsure.map((month) => `${table}_p_${formatMonthKey(month)}`));
  for (const partition of existing) {
    if (partition.endsWith("_p_default")) continue;
    if (keepSet.has(partition)) continue;
    const match = partition.match(/_p_(\d{4}_\d{2})$/);
    if (!match) continue;
    const [year, month] = match[1].split("_").map((part) => Number(part));
    if (!year || !month) continue;
    const partitionStart = monthStartUtc(year, month - 1);
    if (partitionStart < keepFrom) {
      await dropPartition(partition);
    }
  }
};

export const runOrderPartitionMaintenanceOnce = async () => {
  if (!isPartitionMaintenanceEnabled) return;
  if (maintenanceInFlight) return;
  if (retentionMonths < 1) {
    logger.warn("orders.partition.invalid_retention", { retentionMonths });
    return;
  }

  maintenanceInFlight = true;
  try {
    const now = new Date();
    for (const config of tableConfigs) {
      await ensurePartitionsForTable(config.table, config.column, now);
    }
  } catch (error) {
    logger.warn("orders.partition.maintenance_failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } finally {
    maintenanceInFlight = false;
  }
};

export const startOrderPartitionMaintenance = () => {
  if (!isPartitionMaintenanceEnabled) {
    logger.info("orders.partition.disabled");
    return;
  }
  if (maintenanceTimer) return;

  logger.info("orders.partition.worker_started", {
    retentionMonths,
    futureMonths,
    intervalMs: maintenanceIntervalMs,
  });

  maintenanceTimer = setInterval(() => {
    void runOrderPartitionMaintenanceOnce();
  }, maintenanceIntervalMs);

  void runOrderPartitionMaintenanceOnce();
};

export const stopOrderPartitionMaintenance = () => {
  if (!maintenanceTimer) return;
  clearInterval(maintenanceTimer);
  maintenanceTimer = null;
};
