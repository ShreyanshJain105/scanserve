import type { Request, Response, NextFunction } from "express";
import client from "prom-client";

const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

const httpRequestDurationMs = new client.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status_code"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/metrics") {
    return next();
  }

  const end = httpRequestDurationMs.startTimer();
  res.on("finish", () => {
    const route =
      req.route && typeof req.route.path === "string"
        ? `${req.baseUrl}${req.route.path}`
        : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestTotal.inc(labels);
    end(labels);
  });
  return next();
};

export const metricsRegistry = registry;
