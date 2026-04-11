import { logger } from "../utils/logger";

const clickhouseUrl = process.env.CLICKHOUSE_URL || "http://localhost:8123";
const clickhouseUser = process.env.CLICKHOUSE_USER || "default";
const clickhousePassword = process.env.CLICKHOUSE_PASSWORD || "";
const clickhouseDatabase = process.env.CLICKHOUSE_DATABASE || "scan2serve";
const clickhouseTimeoutMs = Math.max(1000, Number(process.env.CLICKHOUSE_TIMEOUT_MS || 5000));

const buildAuthHeader = (user?: string, password?: string) => {
  const resolvedUser = user ?? clickhouseUser;
  const resolvedPassword = password ?? clickhousePassword;
  if (!resolvedUser && !resolvedPassword) return undefined;
  const token = Buffer.from(`${resolvedUser}:${resolvedPassword}`).toString("base64");
  return `Basic ${token}`;
};

export const getClickhouseDatabase = () => clickhouseDatabase;

const runClickhouseRequest = async (query: string, auth?: { user?: string; password?: string }) => {
  const headers: Record<string, string> = {};
  const authHeader = buildAuthHeader(auth?.user, auth?.password);
  if (authHeader) headers.Authorization = authHeader;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), clickhouseTimeoutMs);

  try {
    return await fetch(clickhouseUrl, {
      method: "POST",
      headers,
      body: query,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const message = `ClickHouse query timed out after ${clickhouseTimeoutMs}ms`;
      logger.warn("clickhouse.query.timeout", { message });
      throw new Error(message);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const execClickhouse = async (
  query: string,
  auth?: { user?: string; password?: string }
) => {
  const response = await runClickhouseRequest(query, auth);

  if (!response.ok) {
    const text = await response.text();
    const message = text || `ClickHouse query failed (${response.status})`;
    logger.warn("clickhouse.query.failed", { message });
    throw new Error(message);
  }

  return response.text();
};

export const queryClickhouse = async (
  query: string,
  auth?: { user?: string; password?: string }
) => {
  const response = await runClickhouseRequest(query, auth);

  if (!response.ok) {
    const text = await response.text();
    const message = text || `ClickHouse query failed (${response.status})`;
    logger.warn("clickhouse.query.failed", { message });
    throw new Error(message);
  }

  return response.json();
};
