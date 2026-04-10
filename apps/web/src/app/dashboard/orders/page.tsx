"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { showToast } from "../../../lib/toast";
import { AppHeader } from "../../../components/layout/app-header";
import { BodyBackButton } from "../../../components/layout/body-back-button";
import { AnalyticsOverview } from "../../../components/dashboard/analytics-overview";
import { ModalDialog } from "../../../components/ui/modal-dialog";
import type { OrderStatus } from "@scan2serve/shared";

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-indigo-100 text-indigo-800",
  ready: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-200 text-slate-800",
  cancelled: "bg-rose-100 text-rose-800",
};

const STATUS_CARD: Record<OrderStatus, string> = {
  pending: "border-amber-200 bg-amber-50/70",
  confirmed: "border-blue-200 bg-blue-50/70",
  preparing: "border-indigo-200 bg-indigo-50/70",
  ready: "border-emerald-200 bg-emerald-50/70",
  completed: "border-slate-200 bg-slate-50",
  cancelled: "border-rose-200 bg-rose-50/70",
};

const PAYMENT_BADGE: Record<OrderSummary["paymentStatus"], string> = {
  unpaid: "bg-rose-100 text-rose-800",
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  refunded: "bg-slate-200 text-slate-800",
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "status", label: "Status (pending → completed)" },
  { value: "amount-desc", label: "Amount (high to low)" },
  { value: "amount-asc", label: "Amount (low to high)" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

const DATE_FILTERS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
] as const;

type DateFilter = (typeof DATE_FILTERS)[number]["value"];

type OrderSummary = {
  id: string;
  businessId: string;
  tableId: string;
  status: OrderStatus;
  totalAmount: string;
  paymentStatus: "pending" | "unpaid" | "paid" | "failed" | "refunded";
  paymentMethod: "razorpay" | "cash";
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  customerName: string;
  customerPhone: string | null;
  statusActors?: Record<string, { userId: string | null; email: string | null } | string> | null;
  createdAt: string;
  updatedAt: string;
  table: { id: string; tableNumber: number; label: string | null } | null;
};

type OrderDetail = OrderSummary & {
  items: Array<{
    id: string;
    menuItemId: string;
    name: string | null;
    quantity: number;
    unitPrice: string;
    specialInstructions: string | null;
  }>;
};

const STATUS_ACTOR_LABELS: Record<string, string> = {
  confirmedBy: "Confirmed by",
  preparingBy: "Preparing by",
  readyBy: "Ready by",
  completedBy: "Completed by",
  cancelledBy: "Cancelled by",
};

const resolveActorLabel = (
  actor?: { userId: string | null; email: string | null } | string | null
) => {
  if (!actor) return null;
  if (typeof actor === "string") return actor;
  return actor.email ?? actor.userId ?? null;
};

const STATUS_FLOW_STEPS = [
  { status: "pending" as const, label: "Pending", actorKey: null },
  { status: "confirmed" as const, label: "Confirmed", actorKey: "confirmedBy" },
  { status: "preparing" as const, label: "Preparing", actorKey: "preparingBy" },
  { status: "ready" as const, label: "Ready", actorKey: "readyBy" },
  { status: "completed" as const, label: "Completed", actorKey: "completedBy" },
  { status: "cancelled" as const, label: "Cancelled", actorKey: "cancelledBy" },
] as const;

type OrdersResponse = {
  orders: OrderSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  businessId: string;
};

const ActivityTimeline = ({ detailOrder }: { detailOrder: OrderDetail }) => {
  const activeIndex = STATUS_FLOW_STEPS.findIndex((step) => step.status === detailOrder.status);
  const showCancelled =
    detailOrder.status === "cancelled" || Boolean(detailOrder.statusActors?.cancelledBy);

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {STATUS_FLOW_STEPS.filter((step) => step.status !== "cancelled").map((step, idx, list) => {
          const isActive = detailOrder.status === step.status;
          const isComplete = idx < activeIndex;
          const nextStep = list[idx + 1];
          const connectorActor =
            nextStep?.actorKey && detailOrder.statusActors
              ? detailOrder.statusActors[nextStep.actorKey] ?? null
              : null;
          const actorLabel = resolveActorLabel(connectorActor);
          return (
            <li key={step.status} className="space-y-2">
              <div className="flex items-center gap-3">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    isActive ? "bg-slate-900" : isComplete ? "bg-slate-500" : "bg-slate-200"
                  }`}
                />
                <span
                  className={`text-sm ${
                    isActive ? "font-semibold text-slate-900" : isComplete ? "text-slate-700" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < list.length - 1 && (
                <div className="ml-[5px] border-l border-slate-200 pl-4 text-xs text-slate-500">
                  {actorLabel ?? "—"}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {showCancelled && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Cancelled{" "}
          {detailOrder.statusActors?.cancelledBy
            ? `by ${resolveActorLabel(detailOrder.statusActors.cancelledBy) ?? "Unknown"}`
            : ""}
        </div>
      )}
    </div>
  );
};

export default function DashboardOrdersPage() {
  const { user, loading, selectedBusiness } = useAuth();
  const router = useRouter();
  const [statusFilters, setStatusFilters] = useState<Record<OrderStatus, boolean>>({
    pending: true,
    confirmed: true,
    preparing: true,
    ready: true,
    completed: true,
    cancelled: true,
  });
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OrderDetail | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const latestSignatureRef = useRef<string | null>(null);
  const notificationsPrimedRef = useRef(false);
  const hasInteractedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedBusinessRole =
    selectedBusiness?.businessRole ?? (selectedBusiness?.userId === user?.id ? "owner" : null);
  const blocked =
    !selectedBusiness ||
    selectedBusiness.blocked ||
    selectedBusiness.status === "pending" ||
    selectedBusiness.status === "rejected" ||
    selectedBusiness.status === "archived";
  const blockedReason = selectedBusiness?.blocked
    ? "This business is blocked by an admin. Orders cannot be updated until it is unblocked."
    : selectedBusiness?.status === "pending"
      ? "Orders are unavailable until your selected business is approved."
      : selectedBusiness?.status === "rejected"
        ? "This business was rejected. Update details in onboarding to resubmit for approval."
        : selectedBusiness?.status === "archived"
          ? "This business is archived. Restore it before managing orders."
          : null;

  const headers = useMemo(
    () => (selectedBusiness ? { "x-business-id": selectedBusiness.id } : undefined),
    [selectedBusiness]
  );

  const formatCurrency = (value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return value;
    const currencyCode = selectedBusiness?.currencyCode || "USD";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }).format(amount);
    } catch {
      return value;
    }
  };

  const formatStatusLabel = (status: OrderStatus) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  const formatPaymentLabel = (status: OrderSummary["paymentStatus"]) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  const loadOrders = async ({ reset }: { reset: boolean }) => {
    if (!headers) return null;
    const params = new URLSearchParams();
    if (dateFilter !== "all") params.set("date", dateFilter);
    params.set("tzOffset", String(-new Date().getTimezoneOffset()));
    params.set("limit", "20");
    if (!reset && nextCursor) params.set("cursor", nextCursor);

    const data = await apiFetch<OrdersResponse>(`/api/business/orders?${params.toString()}`, {
      method: "GET",
      headers,
    });

    setOrders((current) => (reset ? data.orders : [...current, ...data.orders]));
    setNextCursor(data.nextCursor);
    setHasMore(Boolean(data.hasMore));
    return data;
  };

  const refreshOrders = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setBusy(true);
      if (orders.length === 0) setInitialLoading(true);
    }
    try {
      const data = await loadOrders({ reset: true });
      if (data) {
        const latest = data.orders.reduce<OrderSummary | null>((current, order) => {
          if (!current) return order;
          const currentTime = new Date(current.createdAt).getTime();
          const nextTime = new Date(order.createdAt).getTime();
          if (nextTime > currentTime) return order;
          if (nextTime === currentTime && order.id > current.id) return order;
          return current;
        }, null);
        const latestSignature = latest ? `${latest.createdAt}-${latest.id}` : null;
        const shouldNotify =
          notificationsPrimedRef.current &&
          latestSignature &&
          latestSignature !== latestSignatureRef.current &&
          document.visibilityState === "visible";
        if (latestSignature) {
          latestSignatureRef.current = latestSignature;
        }
        if (!notificationsPrimedRef.current) {
          notificationsPrimedRef.current = true;
        }
        if (shouldNotify) {
          showToast({
            title: "New order",
            message: "A new order just came in.",
          });
          if (hasInteractedRef.current) {
            if (!audioRef.current) {
              audioRef.current = new Audio("/sounds/order-notification.wav");
              audioRef.current.preload = "auto";
              audioRef.current.volume = 0.7;
            }
            audioRef.current.currentTime = 0;
            void audioRef.current.play().catch(() => {});
          }
        }
      }
      setLastUpdated(new Date());
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to load orders",
      });
    } finally {
      if (!opts?.silent) {
        setBusy(false);
        setInitialLoading(false);
      }
    }
  };

  const openDetail = async (orderId: string) => {
    if (!headers) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setActivityOpen(false);
    try {
      const data = await apiFetch<{ order: OrderDetail }>(`/api/business/orders/${orderId}`, {
        method: "GET",
        headers,
      });
      setDetailOrder(data.order);
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to load order",
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    if (!headers || blocked) return;
    setDetailLoading(true);
    try {
      const data = await apiFetch<{ order: OrderSummary }>(
        `/api/business/orders/${orderId}/status`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status }),
        }
      );
      setOrders((current) =>
        current.map((order) => (order.id === orderId ? { ...order, ...data.order } : order))
      );
      setDetailOrder((current) => (current ? { ...current, ...data.order } : current));
      showToast({ variant: "success", message: "Order status updated." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to update status",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const markCashPaid = async (orderId: string) => {
    if (!headers || blocked) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ order: OrderSummary }>(
        `/api/business/orders/${orderId}/mark-paid`,
        { method: "PATCH", headers }
      );
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, paymentStatus: data.order.paymentStatus } : order
        )
      );
      setDetailOrder((current) =>
        current && current.id === orderId
          ? { ...current, paymentStatus: data.order.paymentStatus }
          : current
      );
      showToast({ variant: "success", message: "Marked as paid." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to mark paid.",
      });
    } finally {
      setBusy(false);
    }
  };

  const statusActions = (status: OrderStatus) => {
    switch (status) {
      case "pending":
        return [
          { label: "Confirm order", value: "confirmed" as const },
          { label: "Cancel order", value: "cancelled" as const },
        ];
      case "confirmed":
        return [
          { label: "Start preparing", value: "preparing" as const },
          { label: "Cancel order", value: "cancelled" as const },
        ];
      case "preparing":
        return [{ label: "Mark ready", value: "ready" as const }];
      case "ready":
        return [{ label: "Mark completed", value: "completed" as const }];
      default:
        return [];
    }
  };

  useEffect(() => {
    if (!loading && !user) router.push("/home");
  }, [loading, user, router]);

  useEffect(() => {
    latestSignatureRef.current = null;
    notificationsPrimedRef.current = false;
  }, [headers, dateFilter]);

  useEffect(() => {
    const markInteraction = () => {
      hasInteractedRef.current = true;
    };
    window.addEventListener("pointerdown", markInteraction, { once: true });
    window.addEventListener("keydown", markInteraction, { once: true });
    return () => {
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
    };
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "business" && !selectedBusinessRole) {
      showToast({
        variant: "error",
        message: "Select a business to manage orders.",
      });
      router.push("/dashboard");
    }
  }, [loading, user?.role, selectedBusinessRole, router]);

  useEffect(() => {
    if (blocked) return;
    refreshOrders();
  }, [blocked, headers, dateFilter]);

  useEffect(() => {
    if (blocked) setInitialLoading(false);
  }, [blocked]);

  useEffect(() => {
    if (blocked) return;
    const id = window.setInterval(() => {
      refreshOrders({ silent: true });
    }, 15000);
    return () => window.clearInterval(id);
  }, [blocked, headers, dateFilter]);

  useEffect(() => {
    if (blocked) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshOrders({ silent: true });
      }
    };
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [blocked, headers, dateFilter]);

  const filteredOrders = useMemo(() => {
    const selectedStatuses = new Set<OrderStatus>(
      ORDER_STATUSES.filter((status) => statusFilters[status])
    );
    const visible = orders.filter((order) => {
      if (selectedStatuses.size === 0) return false;
      if (!selectedStatuses.has(order.status)) return false;
      return true;
    });
    const toAmount = (value: string) => {
      const amount = Number(value);
      return Number.isFinite(amount) ? amount : 0;
    };
    return [...visible].sort((a, b) => {
      if (sortOption === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortOption === "status") {
        return ORDER_STATUSES.indexOf(a.status) - ORDER_STATUSES.indexOf(b.status);
      }
      if (sortOption === "amount-desc") {
        return toAmount(b.totalAmount) - toAmount(a.totalAmount);
      }
      if (sortOption === "amount-asc") {
        return toAmount(a.totalAmount) - toAmount(b.totalAmount);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders, sortOption, statusFilters]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return null;
  if (user.role !== "business") {
    return <div className="p-6">Only business users can manage orders.</div>;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Orders" />
      <section className="mx-auto max-w-6xl space-y-6 p-6">
        <BodyBackButton />
        {blockedReason && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {blockedReason}
          </div>
        )}
        <header className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Order management</h1>
              <p className="mt-1 text-sm text-gray-600">
                Track orders by status and update them as they move through the kitchen.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : "Not updated yet"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshOrders()}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {busy ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="mt-4">
            <AnalyticsOverview section="orders" />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Sort by</p>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Filter by date</p>
              <select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {DATE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Filter by status</p>
              <div className="mt-3 space-y-2">
                {ORDER_STATUSES.map((status) => (
                  <label key={status} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{formatStatusLabel(status)}</span>
                    <input
                      type="checkbox"
                      checked={statusFilters[status]}
                      onChange={(event) =>
                        setStatusFilters((current) => ({
                          ...current,
                          [status]: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                  </label>
                ))}
              </div>
            </div>
          </aside>

          <div className="rounded-xl border bg-white p-4">
            {initialLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="rounded-lg border border-slate-200 p-4">
                    <div className="h-4 w-24 rounded bg-slate-200" />
                    <div className="mt-2 h-6 w-32 rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-40 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            )}
            {filteredOrders.length === 0 && !busy && !initialLoading && (
              <div className="rounded-lg border border-dashed p-6 text-sm text-slate-500">
                No orders match the current filters.
              </div>
            )}

            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(order.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetail(order.id);
                    }
                  }}
                  className={`relative w-full rounded-lg border p-4 text-left shadow-sm transition hover:shadow-md ${
                    STATUS_CARD[order.status]
                  }`}
                >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">Order</p>
                    <p className="text-lg font-semibold text-slate-900">#{order.id.slice(-6)}</p>
                    <p className="text-xs text-slate-500">
                      {order.table
                        ? `Table ${order.table.label ?? order.table.tableNumber}`
                        : "Table unknown"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          STATUS_BADGE[order.status]
                        }`}
                      >
                        {formatStatusLabel(order.status)}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
                          PAYMENT_BADGE[order.paymentStatus]
                        }`}
                      >
                        {formatPaymentLabel(order.paymentStatus)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(order.totalAmount)}
                      </p>
                      <p className="text-xs text-slate-500">{order.customerName}</p>
                    </div>
                    {order.paymentMethod === "cash" && order.paymentStatus !== "paid" && !blocked && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          markCashPaid(order.id);
                        }}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Mark as paid
                      </button>
                    )}
                  </div>
                </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <button
                onClick={() => loadOrders({ reset: false })}
                disabled={busy}
                className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                {busy ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        </section>
      </section>

      <ModalDialog
        open={detailOpen}
        title={detailOrder ? `Order #${detailOrder.id.slice(-6)}` : "Order"}
        subtitle="Order details and actions"
        maxWidthClass="max-w-4xl"
        onClose={() => {
          setDetailOpen(false);
          setDetailOrder(null);
        }}
      >
        {detailLoading && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
            Loading order details...
          </div>
        )}
        {!detailLoading && detailOrder && (
          <div className="grid gap-6 md:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      STATUS_BADGE[detailOrder.status]
                    }`}
                  >
                    {formatStatusLabel(detailOrder.status)}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      PAYMENT_BADGE[detailOrder.paymentStatus]
                    }`}
                  >
                    {formatPaymentLabel(detailOrder.paymentStatus)}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {detailOrder.paymentMethod === "cash" ? "Cash" : "Razorpay"}
                  </span>
                </div>
                <p className="text-base font-semibold text-slate-900">
                  {formatCurrency(detailOrder.totalAmount)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">Customer</p>
                <p className="text-sm text-slate-600">{detailOrder.customerName}</p>
                <p className="text-xs text-slate-500">{detailOrder.customerPhone ?? "No phone"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">Table</p>
                <p className="text-sm text-slate-600">
                  {detailOrder.table
                    ? `Table ${detailOrder.table.label ?? detailOrder.table.tableNumber}`
                    : "Table unknown"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-700">Items</p>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  {detailOrder.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{item.name ?? "Item"}</p>
                        {item.specialInstructions && (
                          <p className="text-xs text-slate-500">{item.specialInstructions}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm">x{item.quantity}</p>
                        <p className="text-xs text-slate-500">{formatCurrency(item.unitPrice)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!blocked && statusActions(detailOrder.status).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {statusActions(detailOrder.status).map((action) => (
                    <button
                      key={action.value}
                      onClick={() => updateStatus(detailOrder.id, action.value)}
                      disabled={detailLoading}
                      className={`rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                        action.value === "cancelled" ? "bg-rose-600" : "bg-slate-900"
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-3 md:hidden">
                <button
                  type="button"
                  onClick={() => setActivityOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-sm font-semibold text-slate-700"
                >
                  <span>Workflow</span>
                  <span className="text-xs text-slate-500">{activityOpen ? "Hide" : "Show"}</span>
                </button>
                {activityOpen && (
                  <div className="mt-3">
                    <ActivityTimeline detailOrder={detailOrder} />
                  </div>
                )}
              </div>
            </div>

            <aside className="hidden self-start rounded-lg border border-slate-200 bg-white p-4 md:block">
              <p className="text-sm font-medium text-slate-700">Workflow</p>
              <div className="mt-4">
                <ActivityTimeline detailOrder={detailOrder} />
              </div>
            </aside>
          </div>
        )}
      </ModalDialog>
    </main>
  );
}
