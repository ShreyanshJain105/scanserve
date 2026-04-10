"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyticsSection,
  AnalyticsSectionResponse,
  AnalyticsWindow,
  AnalyticsWindowResult,
  DashboardAnalyticsSummary,
  OrdersAnalyticsSummary,
} from "@scan2serve/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth-context";

const POSTGRES_WINDOWS: AnalyticsWindow[] = ["today", "yesterday", "currentWeek"];
const WAREHOUSE_WINDOWS: AnalyticsWindow[] = [
  "lastWeek",
  "lastMonth",
  "lastQuarter",
  "lastYear",
];

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

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
};

const normalizeWindow = (value: string | null): AnalyticsWindow | null => {
  if (!value) return null;
  if ((POSTGRES_WINDOWS as string[]).includes(value)) return value as AnalyticsWindow;
  if ((WAREHOUSE_WINDOWS as string[]).includes(value)) return value as AnalyticsWindow;
  return null;
};

const isPostgresWindow = (window: AnalyticsWindow) => POSTGRES_WINDOWS.includes(window);

const buildSummaryRequest = (
  section: AnalyticsSection,
  source: "postgres" | "warehouse",
  windows: AnalyticsWindow[],
  businessId: string
) =>
  apiFetch<AnalyticsSectionResponse>(`/api/business/analytics/${section}` as string, {
    method: "POST",
    headers: { "x-business-id": businessId },
    body: JSON.stringify({
      source,
      windows,
      granularity: "summary",
    }),
  });

type AnalyticsOverviewProps = {
  section: AnalyticsSection;
  showViewMore?: boolean;
};

export const AnalyticsOverview = ({ section, showViewMore = false }: AnalyticsOverviewProps) => {
  const { selectedBusiness } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [windows, setWindows] = useState<Partial<Record<AnalyticsWindow, AnalyticsWindowResult>>>(
    {}
  );
  const [loading, setLoading] = useState(false);
  const prefetched = useRef(new Set<string>());

  const currencyCode = selectedBusiness?.currencyCode ?? "USD";
  const businessId = selectedBusiness?.id;
  const selectedWindow =
    normalizeWindow(searchParams.get("interval")) ?? ("today" as AnalyticsWindow);

  const allWindows = useMemo(
    () => [...POSTGRES_WINDOWS, ...WAREHOUSE_WINDOWS],
    []
  );

  useEffect(() => {
    if (!businessId || selectedBusiness?.status !== "approved") return;
    const key = `${businessId}:${section}`;
    if (prefetched.current.has(key)) return;
    prefetched.current.add(key);

    const prefetch = async () => {
      try {
        await Promise.all([
          buildSummaryRequest(section, "postgres", POSTGRES_WINDOWS, businessId),
          buildSummaryRequest(section, "warehouse", WAREHOUSE_WINDOWS, businessId),
        ]);
      } catch (error) {
        showToast({
          variant: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to prefetch analytics right now.",
        });
      }
    };

    prefetch();
  }, [businessId, section, selectedBusiness?.status]);

  useEffect(() => {
    if (!businessId || selectedBusiness?.status !== "approved") return;
    let cancelled = false;

    const fetchSelected = async () => {
      setLoading(true);
      const source = isPostgresWindow(selectedWindow) ? "postgres" : "warehouse";
      try {
        const data = await apiFetch<AnalyticsSectionResponse>(
          `/api/business/analytics/${section}` as string,
          {
            method: "POST",
            headers: { "x-business-id": businessId },
            body: JSON.stringify({
              source,
              windows: [selectedWindow],
              granularity: "summary",
            }),
          }
        );
        if (cancelled) return;
        setWindows((current) => ({ ...current, ...(data?.windows ?? {}) }));
        if (Object.values(data?.windows ?? {}).some((window) => window?.status === "error")) {
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
        if (!cancelled) setLoading(false);
      }
    };

    fetchSelected();

    return () => {
      cancelled = true;
    };
  }, [businessId, selectedWindow, section, selectedBusiness?.status]);

  if (!businessId) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Select a business to see analytics.
      </div>
    );
  }
  if (selectedBusiness?.status !== "approved") {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Analytics will appear once this business is approved.
      </div>
    );
  }

  const result = windows[selectedWindow];
  const isLoading = loading && !result;

  const dashboardSummary = result?.summary as DashboardAnalyticsSummary | undefined;
  const ordersSummary = result?.summary as OrdersAnalyticsSummary | undefined;

  const totalOrders =
    section === "dashboard"
      ? Number(dashboardSummary?.totalOrders ?? 0)
      : Object.values(ordersSummary?.statusCounts ?? {}).reduce(
          (sum, value) => sum + Number(value ?? 0),
          0
        );
  const paidOrderCount =
    section === "orders" ? Number(ordersSummary?.paidOrderCount ?? 0) : null;
  const unpaidOrderCount =
    section === "orders" ? Number(ordersSummary?.unpaidOrderCount ?? 0) : null;
  const cancellationRate =
    section === "orders" ? ordersSummary?.cancellationRatePct ?? null : null;

  const intervalLabel = WINDOW_LABELS[selectedWindow];

  const onIntervalChange = (value: AnalyticsWindow) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("interval", value);
    router.replace(`?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            {section === "dashboard" ? "Business performance" : "Orders analytics"}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {section === "dashboard"
              ? "Summary view for the selected interval."
              : "Operational order summary for the selected interval."}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500">
            Today/yesterday/current week use Postgres live data. Longer windows use the warehouse cache.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-slate-400" htmlFor={`interval-${section}`}>
            Interval
          </label>
          <select
            id={`interval-${section}`}
            value={selectedWindow}
            onChange={(event) => onIntervalChange(event.target.value as AnalyticsWindow)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {allWindows.map((window) => (
              <option key={window} value={window}>
                {WINDOW_LABELS[window]}
              </option>
            ))}
          </select>
          {showViewMore && section === "dashboard" ? (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/analytics?interval=${selectedWindow}`)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              View more
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <span>{intervalLabel}</span>
          {result?.status === "error" ? <span>Delayed</span> : null}
        </div>

        {isLoading ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((key) => (
              <div key={key} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="h-3 w-24 rounded bg-gray-200 dark:bg-slate-800" />
                <div className="mt-3 h-5 w-16 rounded bg-gray-200 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        ) : section === "dashboard" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs text-gray-500 dark:text-slate-400">Total orders</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">{totalOrders}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs text-gray-500 dark:text-slate-400">Paid revenue</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {formatMoney(currencyCode, dashboardSummary?.paidRevenue ?? "0")}
              </p>
            </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs text-gray-500 dark:text-slate-400">Avg paid order</p>
            <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
              {formatMoney(currencyCode, dashboardSummary?.avgPaidOrderValue ?? "0")}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 sm:col-span-2 lg:col-span-3 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs text-gray-500 dark:text-slate-400">Order growth vs previous window</p>
            <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
              {formatPercent(dashboardSummary?.orderGrowthPct)}
            </p>
          </div>
        </div>
      ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs text-gray-500 dark:text-slate-400">Total orders</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">{totalOrders}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs text-gray-500 dark:text-slate-400">Paid orders</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {paidOrderCount ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs text-gray-500 dark:text-slate-400">Unpaid orders</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {unpaidOrderCount ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs text-gray-500 dark:text-slate-400">Cancellation rate</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {formatPercent(cancellationRate)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
