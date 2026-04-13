"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  AnalyticsSectionResponse,
  AnalyticsWindow,
  BusinessProfile,
  DashboardAnalyticsDetail,
  DashboardAnalyticsSummary,
  OrdersAnalyticsDetail,
  OrdersAnalyticsSummary,
} from "@scan2serve/shared";
import { useRouter } from "next/navigation";
import { AppHeader } from "../../../components/layout/app-header";
import { BodyBackButton } from "../../../components/layout/body-back-button";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { showToast } from "../../../lib/toast";

const WINDOW_LABELS: Record<AnalyticsWindow, string> = {
  today: "Today",
  yesterday: "Yesterday",
  currentWeek: "Current week",
  lastWeek: "Last week",
  lastMonth: "Last month",
  lastQuarter: "Last quarter",
  lastYear: "Last year",
};

const WINDOW_OPTIONS: AnalyticsWindow[] = [
  "today",
  "yesterday",
  "currentWeek",
  "lastWeek",
  "lastMonth",
  "lastQuarter",
  "lastYear",
];

const normalizeWindow = (value: string | null): AnalyticsWindow | null => {
  if (!value) return null;
  if ((WINDOW_OPTIONS as string[]).includes(value)) return value as AnalyticsWindow;
  return null;
};

const sortBusinesses = (items: BusinessProfile[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

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

const formatDecimal = (value?: number | null, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
};

const formatCompactMoney = (currencyCode: string, value: number) => {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
};

const Chart = ({
  values,
  labels,
  currencyCode,
}: {
  values: number[];
  labels: string[];
  currencyCode: string;
}) => {
  if (!values.length) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
        No revenue data yet.
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const range = max - min || 1;
  const width = 980;
  const height = 320;
  const padding = { top: 28, right: 36, bottom: 46, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = values.map((value, index) => {
    const x =
      padding.left + (index / Math.max(values.length - 1, 1)) * plotWidth;
    const y = padding.top + (1 - (value - min) / range) * plotHeight;
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${points[0].x},${padding.top + plotHeight} ${line} ${
    points[points.length - 1].x
  },${padding.top + plotHeight}`;
  const gridLines = 5;
  const labelStep = Math.max(1, Math.floor(labels.length / 6));
  const [lastPoint] = points.slice(-1);
  const tooltipValue = formatCompactMoney(currencyCode, values[values.length - 1]);
  const tooltipLabel = labels[labels.length - 1];
  const gradientId = React.useId();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-72 w-full"
      role="img"
      aria-label="Revenue chart"
    >
      <defs>
        <linearGradient id={`revenue-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {Array.from({ length: gridLines + 1 }).map((_, index) => {
        const y = padding.top + (plotHeight / gridLines) * index;
        return (
          <line
            key={`grid-${index}`}
            x1={padding.left}
            y1={y}
            x2={padding.left + plotWidth}
            y2={y}
            stroke="#e2e8f0"
            strokeDasharray="5 6"
          />
        );
      })}
      <rect
        x={padding.left}
        y={padding.top}
        width={plotWidth}
        height={plotHeight}
        fill="none"
        stroke="#e2e8f0"
      />
      <polygon points={area} fill={`url(#revenue-fill-${gradientId})`} />
      <polyline fill="none" stroke="#4338ca" strokeWidth="2.6" points={line} />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill="#fff" stroke="#4338ca" strokeWidth="2" />
      <line
        x1={lastPoint.x}
        y1={lastPoint.y}
        x2={lastPoint.x}
        y2={padding.top + plotHeight}
        stroke="#c7d2fe"
        strokeDasharray="6 6"
      />
      <g>
        <rect
          x={Math.min(lastPoint.x + 12, width - 150)}
          y={Math.max(lastPoint.y - 28, 12)}
          width={138}
          height={38}
          rx={10}
          fill="#111827"
          opacity="0.9"
        />
        <text
          x={Math.min(lastPoint.x + 24, width - 138)}
          y={Math.max(lastPoint.y - 8, 28)}
          fontSize="10"
          fill="#e5e7eb"
        >
          {tooltipLabel}
        </text>
        <text
          x={Math.min(lastPoint.x + 24, width - 138)}
          y={Math.max(lastPoint.y + 10, 44)}
          fontSize="12"
          fill="#fff"
          fontWeight="600"
        >
          {tooltipValue}
        </text>
      </g>
      {labels.map((label, index) => {
        const x =
          padding.left + (index / Math.max(labels.length - 1, 1)) * plotWidth;
        if (index % labelStep !== 0 && index !== labels.length - 1) return null;
        return (
          <text
            key={`${label}-${index}`}
            x={x}
            y={height - 14}
            textAnchor="middle"
            fontSize="10"
            fill="#94a3b8"
          >
            {label}
          </text>
        );
      })}
      {[0, 0.5, 1].map((ratio, index) => {
        const value = min + (1 - ratio) * range;
        const y = padding.top + ratio * plotHeight;
        return (
          <text key={`y-${index}`} x={14} y={y + 4} fontSize="10" fill="#94a3b8">
            {formatCompactMoney(currencyCode, value)}
          </text>
        );
      })}
    </svg>
  );
};

const StatCard = ({
  title,
  value,
  badge,
  badgeTone,
  icon,
}: {
  title: string;
  value: string;
  badge: string;
  badgeTone: "emerald" | "rose" | "indigo" | "slate";
  icon: React.ReactNode;
}) => {
  const tones: Record<typeof badgeTone, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {title}
        </div>
        <div className="text-indigo-500">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] ${tones[badgeTone]}`}>
        {badge}
      </span>
    </div>
  );
};

const SkeletonBlock = ({ className }: { className?: string }) => (
  <div
    className={`animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800 ${className ?? ""}`}
  />
);

const emptyReviewCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
  1 | 2 | 3 | 4 | 5,
  number
>;

export default function DashboardAnalyticsPage() {
  const { user, loading, businesses, selectedBusiness } = useAuth();
  const router = useRouter();
  const [interval, setInterval] = useState<AnalyticsWindow>(() => {
    if (typeof window === "undefined") return "today";
    const params = new URLSearchParams(window.location.search);
    return normalizeWindow(params.get("interval")) ?? "today";
  });
  const [ordersBusinessId, setOrdersBusinessId] = useState<string | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardAnalyticsSummary | null>(null);
  const [dashboardDetail, setDashboardDetail] = useState<DashboardAnalyticsDetail | null>(null);
  const [ordersSummary, setOrdersSummary] = useState<OrdersAnalyticsSummary | null>(null);
  const [ordersDetail, setOrdersDetail] = useState<OrdersAnalyticsDetail | null>(null);
  const [dashboardSummaryByWindow, setDashboardSummaryByWindow] = useState<
    Partial<Record<AnalyticsWindow, DashboardAnalyticsSummary>>
  >({});
  const [dashboardDetailByWindow, setDashboardDetailByWindow] = useState<
    Partial<Record<AnalyticsWindow, DashboardAnalyticsDetail>>
  >({});
  const [ordersSummaryByWindow, setOrdersSummaryByWindow] = useState<
    Partial<Record<AnalyticsWindow, OrdersAnalyticsSummary>>
  >({});
  const [ordersDetailByWindow, setOrdersDetailByWindow] = useState<
    Partial<Record<AnalyticsWindow, OrdersAnalyticsDetail>>
  >({});
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [dashboardDetailLoading, setDashboardDetailLoading] = useState(false);
  const [ordersDetailLoading, setOrdersDetailLoading] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "business")) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!ordersBusinessId && selectedBusiness?.id) {
      setOrdersBusinessId(selectedBusiness.id);
    }
  }, [ordersBusinessId, selectedBusiness?.id]);

  const sortedBusinesses = useMemo(() => sortBusinesses(businesses), [businesses]);
  useEffect(() => {
    if (!selectedBusiness?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoadingCharts(true);
      try {
        const warmSource = (windowKey: AnalyticsWindow) =>
          ["today", "yesterday", "currentWeek"].includes(windowKey) ? "postgres" : "warehouse";
        const windows = WINDOW_OPTIONS;
        const summaryResponse = await apiFetch<AnalyticsSectionResponse>(
          "/api/business/analytics/dashboard",
          {
            method: "POST",
            headers: { "x-business-id": selectedBusiness.id },
            body: JSON.stringify({
              source: "postgres",
              windows: windows.filter((windowKey) => warmSource(windowKey) === "postgres"),
              granularity: "summary",
            }),
          }
        );
        const warehouseSummaryResponse = await apiFetch<AnalyticsSectionResponse>(
          "/api/business/analytics/dashboard",
          {
            method: "POST",
            headers: { "x-business-id": selectedBusiness.id },
            body: JSON.stringify({
              source: "warehouse",
              windows: windows.filter((windowKey) => warmSource(windowKey) === "warehouse"),
              granularity: "summary",
            }),
          }
        );
        if (cancelled) return;
        const mergedSummary: Partial<Record<AnalyticsWindow, DashboardAnalyticsSummary>> = {};
        for (const windowKey of windows) {
          const from = warmSource(windowKey) === "postgres" ? summaryResponse : warehouseSummaryResponse;
          const summary = from.windows?.[windowKey]?.summary as DashboardAnalyticsSummary | undefined;
          if (summary) mergedSummary[windowKey] = summary;
        }
        setDashboardSummaryByWindow((prev) => ({ ...prev, ...mergedSummary }));
        setDashboardSummary(mergedSummary[interval] ?? null);

        const scheduleDetail = (fn: () => void) => {
          const idle = (
            globalThis as typeof globalThis & {
              requestIdleCallback?: (cb: () => void) => number;
            }
          ).requestIdleCallback;
          if (typeof idle === "function") {
            idle(fn);
            return;
          }
          setTimeout(fn, 250);
        };

        setDashboardDetailLoading(true);
        setOrdersDetailLoading(true);
        scheduleDetail(async () => {
          if (cancelled) return;
          try {
            const detailResponse = await apiFetch<AnalyticsSectionResponse>(
              "/api/business/analytics/dashboard",
              {
                method: "POST",
                headers: { "x-business-id": selectedBusiness.id },
                body: JSON.stringify({
                  source: "postgres",
                  windows: windows.filter((windowKey) => warmSource(windowKey) === "postgres"),
                  granularity: "detail",
                }),
              }
            );
            const warehouseDetailResponse = await apiFetch<AnalyticsSectionResponse>(
              "/api/business/analytics/dashboard",
              {
                method: "POST",
                headers: { "x-business-id": selectedBusiness.id },
                body: JSON.stringify({
                  source: "warehouse",
                  windows: windows.filter((windowKey) => warmSource(windowKey) === "warehouse"),
                  granularity: "detail",
                }),
              }
            );
            if (cancelled) return;
            const mergedDetail: Partial<Record<AnalyticsWindow, DashboardAnalyticsDetail>> = {};
            for (const windowKey of windows) {
              const from = warmSource(windowKey) === "postgres" ? detailResponse : warehouseDetailResponse;
              const detail = from.windows?.[windowKey]?.detail as DashboardAnalyticsDetail | undefined;
              if (detail) mergedDetail[windowKey] = detail;
            }
            setDashboardDetailByWindow((prev) => ({ ...prev, ...mergedDetail }));
            setDashboardDetail(mergedDetail[interval] ?? null);
          } catch (error) {
            if (!cancelled) {
              showToast({
                variant: "error",
                message: error instanceof Error ? error.message : "Unable to load analytics.",
              });
            }
          } finally {
            if (!cancelled) setDashboardDetailLoading(false);
          }
        });
      } catch (error) {
        if (!cancelled) {
          showToast({
            variant: "error",
            message: error instanceof Error ? error.message : "Unable to load analytics.",
          });
        }
      } finally {
        if (!cancelled) setLoadingCharts(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedBusiness?.id]);

  useEffect(() => {
    if (!ordersBusinessId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const warmSource = (windowKey: AnalyticsWindow) =>
          ["today", "yesterday", "currentWeek"].includes(windowKey) ? "postgres" : "warehouse";
        const windows = WINDOW_OPTIONS;
        const summaryResponse = await apiFetch<AnalyticsSectionResponse>(
          "/api/business/analytics/orders",
          {
            method: "POST",
            headers: { "x-business-id": ordersBusinessId },
            body: JSON.stringify({
              source: "postgres",
              windows: windows.filter((windowKey) => warmSource(windowKey) === "postgres"),
              granularity: "summary",
            }),
          }
        );
        const warehouseSummaryResponse = await apiFetch<AnalyticsSectionResponse>(
          "/api/business/analytics/orders",
          {
            method: "POST",
            headers: { "x-business-id": ordersBusinessId },
            body: JSON.stringify({
              source: "warehouse",
              windows: windows.filter((windowKey) => warmSource(windowKey) === "warehouse"),
              granularity: "summary",
            }),
          }
        );
        if (cancelled) return;
        const mergedSummary: Partial<Record<AnalyticsWindow, OrdersAnalyticsSummary>> = {};
        for (const windowKey of windows) {
          const from = warmSource(windowKey) === "postgres" ? summaryResponse : warehouseSummaryResponse;
          const summary = from.windows?.[windowKey]?.summary as OrdersAnalyticsSummary | undefined;
          if (summary) mergedSummary[windowKey] = summary;
        }
        setOrdersSummaryByWindow((prev) => ({ ...prev, ...mergedSummary }));
        setOrdersSummary(mergedSummary[interval] ?? null);

        const scheduleDetail = (fn: () => void) => {
          const idle = (
            globalThis as typeof globalThis & {
              requestIdleCallback?: (cb: () => void) => number;
            }
          ).requestIdleCallback;
          if (typeof idle === "function") {
            idle(fn);
            return;
          }
          setTimeout(fn, 250);
        };

        scheduleDetail(async () => {
          if (cancelled) return;
          try {
            const detailResponse = await apiFetch<AnalyticsSectionResponse>(
              "/api/business/analytics/orders",
              {
                method: "POST",
                headers: { "x-business-id": ordersBusinessId },
                body: JSON.stringify({
                  source: "postgres",
                  windows: windows.filter((windowKey) => warmSource(windowKey) === "postgres"),
                  granularity: "detail",
                }),
              }
            );
            const warehouseDetailResponse = await apiFetch<AnalyticsSectionResponse>(
              "/api/business/analytics/orders",
              {
                method: "POST",
                headers: { "x-business-id": ordersBusinessId },
                body: JSON.stringify({
                  source: "warehouse",
                  windows: windows.filter((windowKey) => warmSource(windowKey) === "warehouse"),
                  granularity: "detail",
                }),
              }
            );
            if (cancelled) return;
            const mergedDetail: Partial<Record<AnalyticsWindow, OrdersAnalyticsDetail>> = {};
            for (const windowKey of windows) {
              const from = warmSource(windowKey) === "postgres" ? detailResponse : warehouseDetailResponse;
              const detail = from.windows?.[windowKey]?.detail as OrdersAnalyticsDetail | undefined;
              if (detail) mergedDetail[windowKey] = detail;
            }
            setOrdersDetailByWindow((prev) => ({ ...prev, ...mergedDetail }));
            setOrdersDetail(mergedDetail[interval] ?? null);
          } catch (error) {
            if (!cancelled) {
              showToast({
                variant: "error",
                message:
                  error instanceof Error ? error.message : "Unable to load orders analytics.",
              });
            }
          } finally {
            if (!cancelled) setOrdersDetailLoading(false);
          }
        });
      } catch (error) {
        if (!cancelled) {
          showToast({
            variant: "error",
            message: error instanceof Error ? error.message : "Unable to load orders analytics.",
          });
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [ordersBusinessId]);

  useEffect(() => {
    setDashboardSummary(dashboardSummaryByWindow[interval] ?? null);
    setDashboardDetail(dashboardDetailByWindow[interval] ?? null);
    setOrdersSummary(ordersSummaryByWindow[interval] ?? null);
    setOrdersDetail(ordersDetailByWindow[interval] ?? null);
  }, [
    interval,
    dashboardSummaryByWindow,
    dashboardDetailByWindow,
    ordersSummaryByWindow,
    ordersDetailByWindow,
  ]);

  const onIntervalChange = (value: AnalyticsWindow) => {
    setInterval(value);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("interval", value);
      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `?${nextQuery}` : window.location.pathname;
      window.history.replaceState(null, "", nextUrl);
    }
  };

  const revenueValues =
    dashboardDetail?.revenueSeries?.map((point) => Number(point.paidRevenue ?? 0)) ?? [];
  const revenueLabels =
    dashboardDetail?.revenueSeries?.map((point) =>
      new Date(point.bucketStart).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
      })
    ) ?? [];

  const statusCounts = ordersSummary?.statusCounts ?? {};
  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const paymentMix = ordersDetail?.paymentMethodMix ?? [];
  const topCategories = dashboardDetail?.topCategories ?? [];
  const reviewSummary = dashboardSummary?.reviews ?? null;
  const reviewDetail = dashboardDetail?.reviews ?? null;
  const reviewRatingCounts = reviewDetail?.ratingCounts ?? reviewSummary?.ratingCounts ?? emptyReviewCounts;
  const reviewTotal =
    reviewSummary?.totalReviews ??
    Object.values(reviewRatingCounts).reduce((sum, value) => sum + value, 0);
  const reviewSeries = reviewDetail?.series ?? [];
  const reviewSeriesSample = reviewSeries.slice(-6);

  const totalStatusCount = statusEntries.reduce((sum, [, count]) => sum + count, 0) || 1;
  const paymentTotal = paymentMix.reduce((sum, item) => sum + item.orderCount, 0) || 1;
  const totalRevenue = Number(dashboardSummary?.paidRevenue ?? 0) || 0;
  const topCategoryMax = Math.max(
    ...topCategories.map((item) => Number(item.paidRevenue ?? 0)),
    1
  );
  const peakHours = [...(ordersDetail?.peakHours ?? [])]
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 3);
  const failedPayments = ordersDetail?.failedPaymentCount ?? null;
  const refundedPayments = ordersDetail?.refundedCount ?? null;
  const isPageLoading = loadingCharts || dashboardDetailLoading || ordersDetailLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-500 pb-24 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <AppHeader leftMeta="Analytics" />
      </div>
      <main className="-mt-14 mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16">
        <BodyBackButton />
        <section className="rounded-[32px] border border-white/60 bg-white/90 p-6 shadow-[0_50px_120px_-60px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/80">
          {isPageLoading ? (
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
              <aside className="rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_25px_60px_-50px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="mt-3 h-5 w-40" />
                <div className="mt-6 space-y-4">
                  <SkeletonBlock className="h-24" />
                  <SkeletonBlock className="h-24" />
                  <SkeletonBlock className="h-24" />
                  <SkeletonBlock className="h-24 bg-slate-200" />
                </div>
              </aside>
              <div className="flex flex-col gap-6">
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-900">
                  <SkeletonBlock className="h-4 w-28" />
                  <SkeletonBlock className="mt-3 h-6 w-52" />
                  <SkeletonBlock className="mt-6 h-72 rounded-3xl" />
                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonBlock key={`kpi-${index}`} className="h-24" />
                    ))}
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <SkeletonBlock className="h-64 rounded-3xl" />
                  <SkeletonBlock className="h-64 rounded-3xl" />
                </div>
                <SkeletonBlock className="h-52 rounded-3xl" />
              </div>
            </div>
          ) : (
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="rounded-3xl border border-slate-100 bg-gradient-to-b from-white via-white to-slate-50/80 p-4 shadow-[0_25px_60px_-50px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">Overview</p>
                  <h1 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Business pulse</h1>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Paid revenue</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(selectedBusiness?.currencyCode ?? "USD", dashboardSummary?.paidRevenue ?? "0")}
                  </p>
                  <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                    {formatPercent(dashboardSummary?.revenueGrowthPct)} vs prior
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total orders</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {dashboardSummary?.totalOrders ?? 0}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    {formatPercent(dashboardSummary?.orderGrowthPct)} vs prior
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Avg items / order</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatDecimal(dashboardSummary?.avgItemsPerOrder ?? null, 1)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    Item density per ticket
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-900 p-3 text-white dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs text-slate-300">Returning customers</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {formatPercent(dashboardDetail?.newVsReturning?.repeatRatePct ?? null)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-300">
                    {dashboardDetail?.newVsReturning
                      ? `${dashboardDetail.newVsReturning.returningCustomers} returning · ${dashboardDetail.newVsReturning.newCustomers} new`
                      : "No customer history yet"}
                  </p>
                </div>
              </div>
            </aside>

            <div className="flex flex-col gap-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
                      Revenue
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      Total revenue
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Snapshot for {WINDOW_LABELS[interval]}.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="rounded-full bg-slate-100 p-1 dark:bg-slate-800">
                      {WINDOW_OPTIONS.map((window) => (
                        <button
                          key={window}
                          type="button"
                          onClick={() => onIntervalChange(window)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                            window === interval
                              ? "bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-slate-100"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {WINDOW_LABELS[window]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      Add filter
                    </button>
                  </div>
                </div>
                <div className="mt-5 rounded-3xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-4 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
                  {loadingCharts ? (
                    <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800" />
                  ) : (
                    <Chart
                      values={revenueValues}
                      labels={revenueLabels}
                      currencyCode={selectedBusiness?.currencyCode ?? "USD"}
                    />
                  )}
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-4">
                  <StatCard
                    title="Total Orders"
                    value={`${dashboardSummary?.totalOrders ?? 0}`}
                    badge={`${formatPercent(dashboardSummary?.orderGrowthPct)} vs prior`}
                    badgeTone="emerald"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                        <path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    }
                  />
                  <StatCard
                    title="Paid Revenue"
                    value={formatMoney(selectedBusiness?.currencyCode ?? "USD", dashboardSummary?.paidRevenue ?? "0")}
                    badge={`${formatPercent(dashboardSummary?.revenueGrowthPct)} vs prior`}
                    badgeTone="indigo"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                        <path d="M12 4v16M7 8h6a3 3 0 010 6H9a3 3 0 000 6h7" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    }
                  />
                  <StatCard
                    title="Avg Order Value"
                    value={formatMoney(selectedBusiness?.currencyCode ?? "USD", dashboardSummary?.avgPaidOrderValue ?? "0")}
                    badge="Per paid order"
                    badgeTone="slate"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                        <path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    }
                  />
                  <StatCard
                    title="Orders / Active Table"
                    value={formatDecimal(dashboardDetail?.ordersPerActiveTable ?? null, 1)}
                    badge={WINDOW_LABELS[interval]}
                    badgeTone="emerald"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                        <path d="M4 7h16M7 12h10M9 17h6" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    }
                  />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Orders snapshot</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Status mix by business.</p>
                    </div>
                    <select
                      value={ordersBusinessId ?? ""}
                      onChange={(event) => setOrdersBusinessId(event.target.value)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {sortedBusinesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-center dark:bg-slate-800">
                      Failed: {failedPayments ?? 0}
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-center dark:bg-slate-800">
                      Refunded: {refundedPayments ?? 0}
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-center dark:bg-slate-800">
                      Avg prep: {formatDecimal(ordersSummary?.avgPrepMinutes ?? null, 0)} min
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {statusEntries.length ? (
                      statusEntries.map(([status, count]) => (
                        <div key={status}>
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span className="capitalize text-slate-700 dark:text-slate-200">{status}</span>
                            <span>{count} orders</span>
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-2 rounded-full bg-indigo-500"
                              style={{ width: `${Math.round((count / totalStatusCount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">No status data yet.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Top categories</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Share of paid revenue.</p>
                  <div className="mt-4 space-y-3">
                    {topCategories.length ? (
                      topCategories.map((item) => {
                        const revenue = Number(item.paidRevenue ?? 0);
                        const share = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
                        return (
                          <div key={item.categoryId} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                            <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                              <span>{item.name}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatPercent(share)}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                              <span>{item.orderCount} orders</span>
                              <span>{formatMoney(selectedBusiness?.currencyCode ?? "USD", item.paidRevenue ?? "0")}</span>
                            </div>
                            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                              <div
                                className="h-1.5 rounded-full bg-emerald-500"
                                style={{ width: `${Math.max(12, (revenue / topCategoryMax) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-400">No category data yet.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payment mix</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Paid orders by method.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {WINDOW_LABELS[interval]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {peakHours.length ? (
                    peakHours.map((hour) => (
                      <span
                        key={`peak-${hour.hour}`}
                        className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800"
                      >
                        Peak {hour.hour}:00 · {hour.orderCount} orders
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                      No peak hour data yet
                    </span>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {paymentMix.length ? (
                    paymentMix.map((item) => (
                      <div key={item.method} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500 capitalize dark:text-slate-400">{item.method}</p>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {Math.round((item.orderCount / paymentTotal) * 100)}%
                          </span>
                        </div>
                        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {item.orderCount}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {formatMoney(selectedBusiness?.currencyCode ?? "USD", item.paidRevenue ?? "0")}
                        </p>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-1.5 rounded-full bg-indigo-500"
                            style={{ width: `${Math.max(12, (item.orderCount / paymentTotal) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No payment data yet.</span>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reviews pulse</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Guest sentiment this window.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {WINDOW_LABELS[interval]}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Average rating</p>
                      <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                        {formatDecimal(reviewSummary?.averageRating ?? null, 2)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        {reviewTotal} reviews
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Review conversion</p>
                      <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                        {formatPercent(reviewSummary?.reviewConversionPct ?? null)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Completed orders → reviews</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Likes per review</p>
                      <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                        {formatDecimal(reviewSummary?.likesPerReview ?? null, 2)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        {reviewSummary?.likesTotal ?? 0} total likes
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Recent trend</p>
                      <div className="mt-2 flex items-end gap-1">
                        {reviewSeriesSample.length ? (
                          reviewSeriesSample.map((point) => {
                            const height = Math.max(6, Math.round((point.reviewCount / Math.max(reviewTotal, 1)) * 40));
                            return (
                              <div
                                key={point.bucketStart}
                                className="flex w-3 flex-col items-center justify-end"
                                title={`${point.reviewCount} reviews · ${formatDecimal(point.averageRating, 2)} avg`}
                              >
                                <span className="block w-full rounded-full bg-indigo-400/80" style={{ height }} />
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-xs text-slate-400">No trend data yet.</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const count = reviewRatingCounts[rating as 1 | 2 | 3 | 4 | 5] ?? 0;
                      const pct = reviewTotal > 0 ? (count / reviewTotal) * 100 : 0;
                      return (
                        <div key={`rating-${rating}`} className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span className="w-6 font-medium text-slate-700 dark:text-slate-200">{rating}★</span>
                          <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-2 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-10 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}
        </section>
      </main>
    </div>
  );
}
