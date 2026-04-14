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
import type { OrderStatus, PaymentActors } from "@/shared";

type IconProps = {
  className?: string;
};

const ChevronUpIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M5 12.5L10 7.5L15 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ChevronDownIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const PencilIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M13.8 3.2L16.8 6.2L7 16H4V13L13.8 3.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const TrashIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M4.5 6H15.5M7.2 6V4.5H12.8V6M6.5 6L7 15.5H13L13.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: "bg-amber-500 text-white",
  confirmed: "bg-blue-600 text-white",
  preparing: "bg-indigo-600 text-white",
  ready: "bg-emerald-600 text-white",
  completed: "bg-slate-300 text-slate-700",
  cancelled: "bg-rose-600 text-white",
};

const STATUS_INDICATOR: Record<OrderStatus, string> = {
  pending: "bg-amber-400",
  confirmed: "bg-blue-400",
  preparing: "bg-indigo-400 animate-pulse",
  ready: "bg-emerald-400 animate-bounce",
  completed: "bg-slate-400",
  cancelled: "bg-rose-400",
};

const PAYMENT_BADGE: Record<OrderSummary["paymentStatus"], string> = {
  unpaid: "bg-rose-100 text-rose-800",
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-600 text-white",
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
  paymentActors?: PaymentActors | null;
  isPinned?: boolean;
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
  pinnedOrderIds?: string[];
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
                    isActive ? "font-black text-black" : isComplete ? "text-zinc-500" : "text-slate-400"
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
  const [pinnedOrderIds, setPinnedOrderIds] = useState<string[]>([]);
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

    const nextPinned = data.pinnedOrderIds ?? pinnedOrderIds;
    setPinnedOrderIds(nextPinned);
    const decoratePinned = (order: OrderSummary) => ({
      ...order,
      isPinned: nextPinned.includes(order.id),
    });
    setOrders((current) =>
      reset ? data.orders.map(decoratePinned) : [...current, ...data.orders.map(decoratePinned)]
    );
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
        current.map((order) => (order.id === orderId ? { ...order, ...data.order } : order))
      );
      setDetailOrder((current) =>
        current && current.id === orderId ? { ...current, ...data.order } : current
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

  const togglePin = async (orderId: string, pinned: boolean) => {
    if (!headers || blocked) return;
    try {
      const data = await apiFetch<{ pinned: boolean }>(`/api/business/orders/${orderId}/pin`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ pinned }),
      });
      const nextPinned = data.pinned
        ? [orderId, ...pinnedOrderIds.filter((id) => id !== orderId)].slice(0, 3)
        : pinnedOrderIds.filter((id) => id !== orderId);
      setPinnedOrderIds(nextPinned);
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, isPinned: data.pinned } : order
        )
      );
      setDetailOrder((current) =>
        current && current.id === orderId ? { ...current, isPinned: data.pinned } : current
      );
      showToast({
        title: data.pinned ? "Order pinned" : "Order unpinned",
        message: data.pinned ? "Pinned orders stay at the top." : "Order removed from pins.",
      });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to update pin.",
      });
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
    const pinnedIndex = new Map(pinnedOrderIds.map((id, index) => [id, index]));
    return [...visible].sort((a, b) => {
      const pinnedA = pinnedIndex.has(a.id) || Boolean(a.isPinned);
      const pinnedB = pinnedIndex.has(b.id) || Boolean(b.isPinned);
      if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
      if (pinnedA && pinnedB) {
        return (pinnedIndex.get(a.id) ?? 0) - (pinnedIndex.get(b.id) ?? 0);
      }
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
  }, [orders, sortOption, statusFilters, pinnedOrderIds]);

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
        <header className="card-standard p-8">
          <div className="flex flex-wrap items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <h1 className="text-4xl font-black text-black tracking-tighter">Kitchen Tasks</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Live order stream and fulfillment dashboard.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Heartbeat</p>
                <p className="text-xs font-black text-black">
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : "Syncing..."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => refreshOrders()}
                disabled={busy}
                className="btn-primary"
              >
                {busy ? "Syncing..." : "Refresh Stream"}
              </button>
            </div>
          </div>
          
          <div className="mt-8">
            <AnalyticsOverview section="orders" />
          </div>
        </header>

        <div className="card-standard p-2 glass">
          <div className="flex flex-wrap items-center gap-4 p-2">
            <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-black uppercase tracking-widest">Sort</span>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
                className="bg-transparent text-sm font-bold text-black focus:outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-black uppercase tracking-widest">Window</span>
              <select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                className="bg-transparent text-sm font-bold text-black focus:outline-none"
              >
                {DATE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1" />

            <div className="flex flex-wrap items-center gap-2 pr-2">
              {ORDER_STATUSES.map((status) => (
                <label 
                  key={status} 
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    statusFilters[status] 
                      ? "border-black bg-black text-white" 
                      : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={statusFilters[status]}
                    onChange={(event) =>
                      setStatusFilters((current) => ({
                        ...current,
                        [status]: event.target.checked,
                      }))
                    }
                    className="hidden"
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest">{status}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <section className="card-standard p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Order</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Table</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Customer</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Payment</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Total</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {initialLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className="animate-pulse">
                      <td colSpan={7} className="px-6 py-8"><div className="h-4 w-full bg-slate-100 rounded" /></td>
                    </tr>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400 italic">No tasks active.</td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr 
                      key={order.id} 
                      onClick={() => openDetail(order.id)}
                      className="group cursor-pointer hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          {order.isPinned && <div className="h-2 w-2 rounded-full bg-amber-400" title="Pinned task" />}
                          <span className="text-sm font-black text-black tracking-tight">#{order.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="px-6 py-5">
                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white">
                          {order.table?.tableNumber || "?"}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-bold text-black">{order.customerName}</p>
                        <p className="text-[10px] text-slate-500">{order.customerPhone || "Direct Guest"}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm ${STATUS_BADGE[order.status]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_INDICATOR[order.status]}`} />
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${PAYMENT_BADGE[order.paymentStatus]}`}>
                          {order.paymentStatus}
                        </span>
                        <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-tighter">via {order.paymentMethod}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-sm font-black text-black">{formatCurrency(order.totalAmount)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); togglePin(order.id, !order.isPinned); }}
                            className="btn-glass p-2"
                          >
                            <span className={order.isPinned ? "text-amber-500" : "text-black"}>★</span>
                          </button>
                          <button className="btn-secondary text-[10px] px-3 py-1.5">View</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex justify-center">
              <button
                onClick={() => loadOrders({ reset: false })}
                disabled={busy}
                className="btn-glass text-xs"
              >
                {busy ? "Loading..." : "Load Older Tasks"}
              </button>
            </div>
          )}
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
                    <button
                      type="button"
                      onClick={() => togglePin(detailOrder.id, !detailOrder.isPinned)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        detailOrder.isPinned
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {detailOrder.isPinned ? "Pinned" : "Pin"}
                    </button>
                  </div>
                  <p className="text-base font-black text-black">
                    {formatCurrency(detailOrder.totalAmount)}
                  </p>
                </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">Customer</p>
                <p className="text-sm text-slate-600">{detailOrder.customerName}</p>
                <p className="text-xs text-slate-500">{detailOrder.customerPhone ?? "No phone"}</p>
              </div>
              {detailOrder.paymentStatus === "paid" &&
                (detailOrder.paymentActors?.paidBy || detailOrder.paymentActors?.paidAt) && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-700">Payment</p>
                    <p className="text-sm text-slate-600">
                      Paid by {resolveActorLabel(detailOrder.paymentActors?.paidBy) ?? "Unknown"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {detailOrder.paymentActors?.paidAt
                        ? new Date(detailOrder.paymentActors.paidAt).toLocaleString()
                        : "Paid time not recorded"}
                    </p>
                  </div>
                )}
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
                        <p className="font-black text-black">{item.name ?? "Item"}</p>
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
