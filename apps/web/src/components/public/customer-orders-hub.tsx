"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import type { CustomerOrdersListResponse, CustomerOrderSummary } from "@scan2serve/shared";
import { ModalDialog } from "../ui/modal-dialog";

type OrderDetailResponse = {
  business: { name: string; currencyCode: string } | null;
  order: {
    id: string;
    businessId: string;
    tableId: string;
    status: string;
    totalAmount: string;
    paymentStatus: string;
    paymentMethod: string;
    createdAt: string;
    reviewId?: string | null;
  };
  items: {
    id: string;
    menuItemId: string;
    name: string | null;
    quantity: number;
    unitPrice: string;
    specialInstructions: string | null;
  }[];
};

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "preparing", "ready"]);

const formatCurrency = (value: string, currency: string) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(numeric);
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const selectDefaultOrder = (orders: CustomerOrderSummary[]) => {
  const active = orders.find((order) => ACTIVE_STATUSES.has(order.status));
  return active ?? orders[0] ?? null;
};

export default function CustomerOrdersHub({
  initialOrderId,
}: {
  initialOrderId?: string | null;
}) {
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialOrderId ?? null
  );
  const [detail, setDetail] = useState<OrderDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const selectedSummary = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  const activeOrders = useMemo(
    () => orders.filter((order) => ACTIVE_STATUSES.has(order.status)),
    [orders]
  );
  const historyOrders = useMemo(
    () => orders.filter((order) => !ACTIVE_STATUSES.has(order.status)),
    [orders]
  );

  const loadOrders = async (cursor?: string, append = false) => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "10");
      if (cursor) params.set("cursor", cursor);
      const data = await apiFetch<CustomerOrdersListResponse>(
        `/api/public/orders?${params.toString()}`
      );
      setOrders((prev) => (append ? [...prev, ...data.orders] : data.orders));
      setNextCursor(data.nextCursor);
      if (!append) {
        if (initialOrderId) {
          setSelectedOrderId(initialOrderId);
        } else {
          const nextDefault = selectDefaultOrder(data.orders);
          setSelectedOrderId(nextDefault?.id ?? null);
        }
      }
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Unable to load orders.",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOrderDetail = async (orderId: string) => {
    setDetailLoading(true);
    try {
      const data = await apiFetch<OrderDetailResponse>(`/api/public/orders/${orderId}`);
      setDetail(data);
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Unable to load order details.",
      });
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openReviewDialog = () => {
    setReviewRating(5);
    setReviewComment("");
    setReviewDialogOpen(true);
  };

  const submitReview = async () => {
    if (!detail) return;
    setReviewSubmitting(true);
    try {
      const response = await apiFetch<{ review: { id: string } }>(
        "/api/public/reviews",
        {
          method: "POST",
          body: JSON.stringify({
            orderId: detail.order.id,
            rating: reviewRating,
            comment: reviewComment.trim() ? reviewComment.trim() : undefined,
          }),
        }
      );
      setOrders((prev) =>
        prev.map((order) =>
          order.id === detail.order.id ? { ...order, reviewId: response.review.id } : order
        )
      );
      setDetail((prev) =>
        prev
          ? { ...prev, order: { ...prev.order, reviewId: response.review.id } }
          : prev
      );
      setReviewDialogOpen(false);
      showToast({ variant: "success", message: "Review submitted. Thank you!" });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Unable to submit review.",
      });
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedOrderId) {
      setDetail(null);
      return;
    }
    void loadOrderDetail(selectedOrderId);
  }, [selectedOrderId]);

  useEffect(() => {
    setReviewDialogOpen(false);
  }, [selectedOrderId]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await loadOrders(nextCursor, true);
    setLoadingMore(false);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Your orders
          </p>
          <h1 className="mt-2 font-display text-3xl text-slate-900">Order hub</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track current and past orders across all visited businesses.
          </p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-100 to-rose-100 px-4 py-3 text-right shadow-inner">
          <p className="text-xs font-medium text-amber-700">Customer account</p>
          <p className="text-[13px] text-slate-700">
            Orders are visible for your signed-in account.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px,1fr]">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-900">Orders</p>
          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No orders yet. Place your first order from a table QR menu.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Current orders
                </p>
                {activeOrders.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    No active orders right now.
                  </div>
                ) : (
                  activeOrders.map((order) => {
                    const isSelected = order.id === selectedOrderId;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                          isSelected
                            ? "border-rose-300 bg-rose-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/40"
                        }`}
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {order.business?.name ?? "Unknown business"}
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900 capitalize">
                          {order.status}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Updated {formatDateTime(order.updatedAt)}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                          <span className="capitalize">{order.paymentStatus}</span>
                          <span>
                            {formatCurrency(
                              order.totalAmount,
                              order.business?.currencyCode ?? "USD"
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  <span>History</span>
                  <span className="text-[11px] text-slate-500">
                    {historyOrders.length} orders
                  </span>
                </button>
                {showHistory ? (
                  historyOrders.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      No past orders yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {historyOrders.map((order) => {
                        const isSelected = order.id === selectedOrderId;
                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => setSelectedOrderId(order.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                              isSelected
                                ? "border-rose-200 bg-rose-50"
                                : "border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/40"
                            }`}
                          >
                            <p className="text-[11px] uppercase tracking-wide text-slate-500">
                              {order.business?.name ?? "Unknown business"}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-900 capitalize">
                              {order.status}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Updated {formatDateTime(order.updatedAt)}
                            </p>
                          </button>
                        );
                      })}
                      {nextCursor ? (
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:text-rose-700"
                        >
                          {loadingMore ? "Loading..." : "Load more"}
                        </button>
                      ) : null}
                    </div>
                  )
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {detailLoading ? (
            <p className="text-sm text-slate-600">Loading order details...</p>
          ) : !detail ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Select an order to view its details.
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Order detail
              </p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                {detail.business?.name ? `${detail.business.name} order` : "Order details"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Placed {formatDateTime(detail.order.createdAt)}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 capitalize">
                    {detail.order.status}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payment
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 capitalize">
                    {detail.order.paymentStatus}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Total
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatCurrency(
                      detail.order.totalAmount,
                      detail.business?.currencyCode ?? "USD"
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <p className="text-sm font-semibold text-slate-900">Items</p>
                {detail.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {item.name || "Menu item"}
                      </p>
                      <p className="text-xs text-slate-600">
                        {item.quantity} ×{" "}
                        {formatCurrency(
                          item.unitPrice,
                          detail.business?.currencyCode ?? "USD"
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(
                        (Number(item.unitPrice) * item.quantity).toFixed(2),
                        detail.business?.currencyCode ?? "USD"
                      )}
                    </p>
                  </div>
                ))}
              </div>

              {detail.order.status === "completed" ? (
                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Review
                  </p>
                  {detail.order.reviewId ? (
                    <p className="mt-2 text-sm text-slate-700">
                      Thanks for sharing your feedback. This order is reviewed.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <p className="text-sm text-slate-600">
                        Share a quick rating to help others.
                      </p>
                      <button
                        type="button"
                        onClick={openReviewDialog}
                        className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Give review
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ModalDialog
        open={reviewDialogOpen}
        onClose={reviewSubmitting ? undefined : () => setReviewDialogOpen(false)}
        title="Leave a review"
        subtitle="Rate your experience with this order."
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rating
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReviewRating(value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    reviewRating === value
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"
                  }`}
                >
                  {value}★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comment (optional)
            </label>
            <textarea
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value.slice(0, 250))}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="Share a short note..."
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {250 - reviewComment.length} characters left
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setReviewDialogOpen(false)}
              className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              disabled={reviewSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReview}
              disabled={reviewSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {reviewSubmitting ? "Submitting..." : "Submit review"}
            </button>
          </div>
        </div>
      </ModalDialog>
    </section>
  );
}
