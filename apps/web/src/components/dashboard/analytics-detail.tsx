"use client";

import React, { useEffect, useState } from "react";
import type {
  AnalyticsSection,
  AnalyticsSectionResponse,
  AnalyticsWindow,
  AnalyticsWindowResult,
  DashboardAnalyticsDetail,
  OrdersAnalyticsDetail,
} from "@scan2serve/shared";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";

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

const normalizeWindow = (value: string | null): AnalyticsWindow | null => {
  if (!value) return null;
  if ((POSTGRES_WINDOWS as string[]).includes(value)) return value as AnalyticsWindow;
  if ((WAREHOUSE_WINDOWS as string[]).includes(value)) return value as AnalyticsWindow;
  return null;
};

const isPostgresWindow = (window: AnalyticsWindow) => POSTGRES_WINDOWS.includes(window);

const MiniLineChart = ({ values }: { values: number[] }) => {
  if (!values.length) {
    return (
      <div className="flex h-28 w-56 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[11px] text-gray-400">
        No data
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const range = max - min || 1;
  const width = 180;
  const height = 86;
  const padding = { top: 10, right: 10, bottom: 12, left: 10 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = values.map((value, index) => {
    const x =
      padding.left + (index / Math.max(values.length - 1, 1)) * plotWidth;
    const y = padding.top + (1 - (value - min) / range) * plotHeight;
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-56">
      <rect
        x={padding.left}
        y={padding.top}
        width={plotWidth}
        height={plotHeight}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="1"
      />
      <line
        x1={padding.left}
        y1={padding.top + plotHeight / 2}
        x2={padding.left + plotWidth}
        y2={padding.top + plotHeight / 2}
        stroke="#e5e7eb"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <polyline
        fill="none"
        stroke="#475569"
        strokeWidth="2.5"
        points={line}
      />
    </svg>
  );
};

const TrendCard = ({
  title,
  values,
  label,
}: {
  title: string;
  values: number[];
  label: string;
}) => {
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500">{title}</p>
        </div>
        <MiniLineChart values={values} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>
          {label} · min {min.toFixed(0)} · max {max.toFixed(0)}
        </span>
        <span>Start → End</span>
      </div>
    </div>
  );
};

type AnalyticsDetailProps = {
  section: AnalyticsSection;
  businessId?: string | null;
};

export const AnalyticsDetail = ({ section, businessId }: AnalyticsDetailProps) => {
  const searchParams = useSearchParams();
  const [windowResult, setWindowResult] = useState<AnalyticsWindowResult | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedWindow =
    normalizeWindow(searchParams.get("interval")) ?? ("today" as AnalyticsWindow);
  const intervalLabel = WINDOW_LABELS[selectedWindow];

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    const fetchDetail = async () => {
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
              granularity: "detail",
            }),
          }
        );
        if (cancelled) return;
        const next = data?.windows?.[selectedWindow] ?? null;
        setWindowResult(next);
        if (next?.status === "error") {
          showToast({
            variant: "error",
            message: "Some analytics detail could not be loaded yet.",
          });
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            variant: "error",
            message:
              error instanceof Error ? error.message : "Unable to load analytics detail right now.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [businessId, section, selectedWindow]);

  const dashboardDetail = windowResult?.detail as DashboardAnalyticsDetail | undefined;
  const ordersDetail = windowResult?.detail as OrdersAnalyticsDetail | undefined;

  const topCategories = dashboardDetail?.topCategories ?? [];
  const topItems = dashboardDetail?.topItems ?? [];
  const statusSeriesCount = Object.keys(ordersDetail?.statusSeries ?? {}).length;
  const peakHours = ordersDetail?.peakHours ?? [];
  const paymentMix = ordersDetail?.paymentMethodMix ?? [];

  const ordersSeriesValues =
    dashboardDetail?.ordersSeries?.map((point) => point.orderCount) ?? [];
  const revenueSeriesValues =
    dashboardDetail?.revenueSeries?.map((point) => Number(point.paidRevenue ?? 0)) ?? [];
  const statusSeriesValues = Object.entries(ordersDetail?.statusSeries ?? {}).map(
    ([status, points]) => ({
      status,
      total: points.reduce((sum, point) => sum + Number(point.orderCount ?? 0), 0),
    })
  );

  if (!businessId) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
        Select a business to view analytics detail.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {section === "dashboard" ? "Business performance detail" : "Orders detail"}
          </p>
          <p className="text-xs text-gray-500">Detail analytics for {intervalLabel}.</p>
        </div>
        {windowResult?.status === "error" ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] text-amber-700">
            Delayed
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[1, 2].map((key) => (
            <div key={key} className="h-20 rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : section === "dashboard" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Orders per active table</p>
            <p className="mt-2 text-base font-semibold text-gray-900">
              {dashboardDetail?.ordersPerActiveTable?.toFixed(2) ?? "—"}
            </p>
          </div>
          <TrendCard title="Orders trend" values={ordersSeriesValues} label="Orders" />
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Top categories</p>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              {topCategories.length ? (
                topCategories.map((item) => (
                  <div key={item.categoryId} className="flex items-center justify-between">
                    <span>{item.name}</span>
                    <span className="text-xs text-gray-500">{item.orderCount} orders</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-gray-500">No category data yet.</span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Top items</p>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              {topItems.length ? (
                topItems.map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between">
                    <span>{item.name}</span>
                    <span className="text-xs text-gray-500">{item.orderCount} orders</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-gray-500">No item data yet.</span>
              )}
            </div>
          </div>
          <div className="lg:col-span-2">
            <TrendCard title="Revenue trend" values={revenueSeriesValues} label="Revenue" />
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Status series buckets</p>
            <p className="mt-2 text-base font-semibold text-gray-900">{statusSeriesCount}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Failed payments</p>
            <p className="mt-2 text-base font-semibold text-gray-900">
              {ordersDetail?.failedPaymentCount ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Status volume (legend)</p>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              {statusSeriesValues.length ? (
                statusSeriesValues.map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      <span className="capitalize">{item.status}</span>
                    </div>
                    <span className="text-xs text-gray-500">{item.total} orders</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-gray-500">No status data yet.</span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Peak hours</p>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              {peakHours.length ? (
                peakHours.map((item) => (
                  <div key={item.hour} className="flex items-center justify-between">
                    <span>{item.hour}:00</span>
                    <span className="text-xs text-gray-500">{item.orderCount} orders</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-gray-500">No peak-hour data yet.</span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Payment mix</p>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              {paymentMix.length ? (
                paymentMix.map((item) => (
                  <div key={item.method} className="flex items-center justify-between">
                    <span className="capitalize">{item.method}</span>
                    <span className="text-xs text-gray-500">{item.orderCount} orders</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-gray-500">No payment data yet.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
