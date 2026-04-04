"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  AnalyticsSectionResponse,
  AnalyticsWindow,
  AnalyticsWindowResult,
} from "@scan2serve/shared";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth-context";

const WINDOW_LABELS: Record<AnalyticsWindow, string> = {
  today: "Today",
  yesterday: "Yesterday",
  currentWeek: "Current week",
  lastWeek: "Last week",
  lastMonth: "Last month",
  lastQuarter: "Last quarter",
  lastYear: "Last year",
};

const formatMoney = (currencyCode: string, value: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const AnalyticsOverview = () => {
  const { selectedBusiness } = useAuth();
  const [windows, setWindows] = useState<Partial<Record<AnalyticsWindow, AnalyticsWindowResult>>>(
    {}
  );
  const [loadingSource, setLoadingSource] = useState({
    postgres: true,
    warehouse: true,
  });

  const currencyCode = selectedBusiness?.currencyCode ?? "USD";
  const businessId = selectedBusiness?.id;

  const sortedWindows = useMemo(
    () =>
      [
        "today",
        "yesterday",
        "currentWeek",
        "lastWeek",
        "lastMonth",
        "lastQuarter",
        "lastYear",
      ] as AnalyticsWindow[],
    []
  );

  useEffect(() => {
    if (!businessId || selectedBusiness?.status !== "approved") return;
    let cancelled = false;

    const fetchSource = async (source: "postgres" | "warehouse") => {
      const windows =
        source === "postgres"
          ? (["today", "yesterday", "currentWeek"] as AnalyticsWindow[])
          : (["lastWeek", "lastMonth", "lastQuarter", "lastYear"] as AnalyticsWindow[]);
      try {
        const data = await apiFetch<AnalyticsSectionResponse>(
          "/api/business/analytics/overview",
          {
            method: "POST",
            headers: { "x-business-id": businessId },
            body: JSON.stringify({ source, windows }),
          }
        );
        if (cancelled) return;
        const nextWindows = data?.windows ?? {};
        setWindows((current) => ({ ...current, ...nextWindows }));
        const hasError = Object.values(nextWindows).some(
          (window) => window?.status === "error"
        );
        if (hasError) {
          showToast({
            variant: "error",
            message: "Some analytics data could not be loaded yet.",
          });
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            variant: "error",
            message:
              error instanceof Error ? error.message : "Unable to load analytics right now.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingSource((current) => ({ ...current, [source]: false }));
        }
      }
    };

    setLoadingSource({ postgres: true, warehouse: true });
    fetchSource("postgres");
    fetchSource("warehouse");

    return () => {
      cancelled = true;
    };
  }, [businessId, selectedBusiness?.status]);

  if (!businessId) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
        Select a business to see analytics.
      </div>
    );
  }
  if (selectedBusiness?.status !== "approved") {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
        Analytics will appear once this business is approved.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Analytics overview</h3>
          <p className="text-xs text-gray-500">
            Today uses Postgres live data. Longer windows use the warehouse cache.
          </p>
        </div>
        {(loadingSource.postgres || loadingSource.warehouse) && (
          <span className="text-xs text-gray-500">Loading analytics…</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sortedWindows.map((window) => {
          const result = windows[window];
          const isLoading =
            (window === "today" || window === "yesterday" || window === "currentWeek"
              ? loadingSource.postgres
              : loadingSource.warehouse) && !result;
          return (
            <div key={window} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{WINDOW_LABELS[window]}</span>
                {result?.status === "error" ? <span>Delayed</span> : null}
              </div>
              {isLoading ? (
                <div className="mt-3 space-y-2">
                  <div className="h-4 w-20 rounded bg-gray-100" />
                  <div className="h-4 w-28 rounded bg-gray-100" />
                  <div className="h-4 w-16 rounded bg-gray-100" />
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Orders</span>
                    <span className="font-semibold">
                      {result?.summary.orderCount ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Paid revenue</span>
                    <span className="font-semibold">
                      {formatMoney(currencyCode, result?.summary.paidRevenue ?? "0")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Avg paid order</span>
                    <span className="font-semibold">
                      {formatMoney(currencyCode, result?.summary.avgPaidOrderValue ?? "0")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
