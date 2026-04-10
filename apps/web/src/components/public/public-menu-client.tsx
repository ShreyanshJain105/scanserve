"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth-context";
import type { ReviewListResponse, ReviewListItem, ReviewScope, ReviewSummary } from "@scan2serve/shared";

type PublicMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  dietaryTags: string[];
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
};

type PublicMenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  items: PublicMenuItem[];
};

type PublicMenuData = {
  business: { id: string; name: string; slug: string; currencyCode: string };
  table: { id: string; number: number } | null;
  categories: PublicMenuCategory[];
};

type PublicMenuClientProps = {
  data: PublicMenuData;
  cartKey: string;
};

type CartItem = PublicMenuItem & { quantity: number };

const CART_MAX_QTY = 20;

type RazorpayCheckoutResponse = {
  razorpayOrderId: string;
  keyId: string;
  amount: number;
  currency: string;
  businessName: string;
};

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: {
    name?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: { error: { description?: string } }) => void) => void;
};

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

const loadRazorpayScript = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Razorpay unavailable"));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const formatPrice = (price: string, currency: string) => {
  const value = Number(price);
  if (Number.isNaN(value)) return price;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
};

export function PublicMenuClient({ data, cartKey }: PublicMenuClientProps) {
  const { customerUser } = useAuth();
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("token") ?? searchParams.get("qrToken");
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [limitNotice, setLimitNotice] = React.useState<string | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<"razorpay" | "cash">("razorpay");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [reviews, setReviews] = React.useState<ReviewListItem[]>([]);
  const [reviewSummary, setReviewSummary] = React.useState<ReviewSummary | null>(null);
  const [reviewScope, setReviewScope] = React.useState<ReviewScope>("recent");
  const [reviewRatingFilter, setReviewRatingFilter] = React.useState<number | null>(null);
  const [reviewPage, setReviewPage] = React.useState(1);
  const [reviewTotal, setReviewTotal] = React.useState(0);
  const [reviewLoading, setReviewLoading] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(cartKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CartItem[];
        setCart(parsed);
      } catch {
        setCart([]);
      }
    } else {
      setCart([]);
    }
  }, [cartKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, cartKey]);

  React.useEffect(() => {
    let active = true;
    const loadReviews = async () => {
      setReviewLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("businessId", data.business.id);
        params.set("page", String(reviewPage));
        params.set("limit", "10");
        params.set("scope", reviewScope);
        if (reviewRatingFilter) {
          params.set("rating", String(reviewRatingFilter));
        }
        const response = await apiFetch<ReviewListResponse>(
          `/api/public/reviews?${params.toString()}`
        );
        if (!active) return;
        setReviews(response.reviews);
        setReviewSummary(response.summary);
        setReviewTotal(response.total);
      } catch (error) {
        if (!active) return;
        showToast({
          variant: "error",
          message: error instanceof Error ? error.message : "Unable to load reviews.",
        });
      } finally {
        if (active) setReviewLoading(false);
      }
    };

    void loadReviews();
    return () => {
      active = false;
    };
  }, [data.business.id, reviewPage, reviewRatingFilter, reviewScope]);

  const total = React.useMemo(
    () =>
      cart.reduce((sum, item) => {
        const price = Number(item.price);
        return sum + (Number.isNaN(price) ? 0 : price * item.quantity);
      }, 0),
    [cart]
  );

  const upsertItem = (item: PublicMenuItem, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((row) => row.id === item.id);
      const nextQty = (existing?.quantity ?? 0) + delta;
      if (nextQty > CART_MAX_QTY) {
        setLimitNotice(`Max ${CART_MAX_QTY} per item`);
        return prev;
      }
      if (nextQty <= 0) {
        return prev.filter((row) => row.id !== item.id);
      }
      setLimitNotice(null);
      if (existing) {
        return prev.map((row) => (row.id === item.id ? { ...row, quantity: nextQty } : row));
      }
      return [...prev, { ...item, quantity: nextQty }];
    });
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((row) => row.id !== id));
  };

  const clearCart = () => {
    setCart([]);
  };

  const sortedCategories = [...data.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasTable = Boolean(data.table);
  const canCheckout =
    cart.length > 0 && hasTable && customerName.trim().length > 0 && !isSubmitting;

  const handleCheckout = async () => {
    if (!customerUser) {
      showToast({ variant: "error", message: "Please log in to place your order." });
      if (qrToken) {
        window.location.assign(`/qr/login?token=${encodeURIComponent(qrToken)}`);
      } else {
        window.location.assign("/qr/login");
      }
      return;
    }
    if (!hasTable) {
      showToast({
        variant: "error",
        message: "Table information is missing. Please rescan the QR code.",
      });
      return;
    }
    if (!customerName.trim()) {
      showToast({ variant: "error", message: "Enter your name to continue." });
      return;
    }
    if (cart.length === 0) {
      showToast({ variant: "error", message: "Your cart is empty." });
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await apiFetch<{
        orderId: string;
        amount: string;
        paymentStatus: string;
        paymentMethod: string;
      }>("/api/public/orders", {
        method: "POST",
        body: JSON.stringify({
          businessId: data.business.id,
          tableId: data.table!.id,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() ? customerPhone.trim() : undefined,
          paymentMethod,
          items: cart.map((item) => ({
            menuItemId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      if (paymentMethod === "cash") {
        clearCart();
        setCartOpen(false);
        showToast({ variant: "success", message: "Cash order placed." });
        setIsSubmitting(false);
        window.location.assign(`/orders?orderId=${encodeURIComponent(order.orderId)}`);
        return;
      }

      const checkout = await apiFetch<RazorpayCheckoutResponse>(
        `/api/public/orders/${order.orderId}/checkout`,
        { method: "POST" }
      );

      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error("Razorpay checkout unavailable.");
      }

      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: checkout.businessName,
        description: `Order ${order.orderId}`,
        order_id: checkout.razorpayOrderId,
        prefill: {
          name: customerName.trim(),
          contact: customerPhone.trim() || undefined,
        },
        notes: {
          orderId: order.orderId,
        },
        handler: async (response) => {
          try {
            await apiFetch(`/api/public/orders/${order.orderId}/verify-payment`, {
              method: "POST",
              body: JSON.stringify(response),
            });
            clearCart();
            setCartOpen(false);
            window.location.assign(`/orders?orderId=${encodeURIComponent(order.orderId)}`);
          } catch (error) {
            showToast({
              variant: "error",
              message: error instanceof Error ? error.message : "Payment verification failed.",
            });
          } finally {
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsSubmitting(false);
          },
        },
      });

      razorpay.on("payment.failed", (response) => {
        showToast({
          variant: "error",
          message: response.error?.description || "Payment failed. Please try again.",
        });
        setIsSubmitting(false);
      });

      razorpay.open();
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Checkout failed.",
      });
      setIsSubmitting(false);
    }
  };

  const totalReviewPages = Math.max(1, Math.ceil(reviewTotal / 10));

  const handleLikeToggle = async (reviewId: string) => {
    if (!customerUser) {
      showToast({ variant: "error", message: "Log in to like reviews." });
      if (qrToken) {
        window.location.assign(`/qr/login?token=${encodeURIComponent(qrToken)}`);
      } else {
        window.location.assign("/qr/login");
      }
      return;
    }
    try {
      const response = await apiFetch<{ liked: boolean; likesCount: number }>(
        `/api/public/reviews/${reviewId}/like`,
        { method: "POST" }
      );
      setReviews((prev) =>
        prev.map((review) =>
          review.id === reviewId
            ? { ...review, likedByCustomer: response.liked, likesCount: response.likesCount }
            : review
        )
      );
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Unable to update like.",
      });
    }
  };

  const applyReviewFilter = (scope: ReviewScope, rating: number | null) => {
    setReviewScope(scope);
    setReviewRatingFilter(rating);
    setReviewPage(1);
  };

  return (
    <div className="relative">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Public menu</p>
            <h1 className="font-display text-3xl text-slate-900">{data.business.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Table: {data.table ? `#${data.table.number}` : "Not at a table"}
            </p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-100 to-rose-100 px-4 py-3 text-right shadow-inner">
            <p className="text-xs font-medium text-amber-700">Cart saved on this device</p>
            <p className="text-[13px] text-slate-700">
              Keyed to business/table/QR token for isolation
            </p>
          </div>
        </div>

        {sortedCategories.length === 0 ? (
          <p className="mt-6 text-sm text-slate-600">
            Menu is empty. Please check back soon.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {sortedCategories.map((category) => {
              const items = [...category.items].sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <div key={category.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-2xl text-slate-900">{category.name}</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-slate-200 via-slate-100 to-transparent" />
                  </div>
                  {items.length === 0 ? (
                    <p className="text-sm text-slate-600">No items yet.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {items.map((item) => {
                        const inCart = cart.find((row) => row.id === item.id);
                        return (
                          <article
                            key={item.id}
                            className="flex w-full flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:gap-4"
                          >
                            <div className="flex items-center gap-3">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-20 w-20 shrink-0 rounded-md object-cover"
                                />
                              ) : (
                                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
                                  No image
                                </div>
                              )}
                              <div className="space-y-1">
                                <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
                                {item.dietaryTags.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {item.dietaryTags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <p className="text-xs text-slate-600">
                                  {item.description || "No description provided."}
                                </p>
                              </div>
                            </div>
                            <div className="ml-auto flex flex-col items-end gap-2 md:min-w-[180px]">
                              <div className="text-right">
                                <p className="text-sm font-semibold text-slate-900">
                                  {formatPrice(item.price, data.business.currencyCode)}
                                </p>
                                {!item.isAvailable && (
                                  <p className="text-xs font-medium text-rose-600">Unavailable</p>
                                )}
                              </div>
                              <div className="flex w-full items-center justify-end">
                                <div className="flex items-center gap-3 rounded-full bg-rose-600 px-3 py-1 text-white shadow-sm">
                                  <button
                                    type="button"
                                    disabled={!inCart}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      upsertItem(item, -1);
                                    }}
                                    className={`text-sm font-semibold ${
                                      inCart ? "opacity-100" : "opacity-40 cursor-not-allowed"
                                    }`}
                                    aria-label={`Decrease ${item.name}`}
                                  >
                                    −
                                  </button>
                                  <span className="text-sm font-semibold">
                                    {inCart ? inCart.quantity : 0}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={!item.isAvailable}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      upsertItem(item, 1);
                                    }}
                                    className={`text-sm font-semibold ${
                                      item.isAvailable ? "opacity-100" : "opacity-40 cursor-not-allowed"
                                    }`}
                                    aria-label={`Add ${item.name}`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-600">
                                {inCart ? `In cart: ${inCart.quantity}` : "Add to cart"}
                              </p>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer reviews
              </p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                What diners are saying
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Recent feedback from completed orders.
              </p>
            </div>
            {reviewSummary ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Average rating
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {reviewSummary.averageRating.toFixed(1)}
                </p>
                <p className="text-xs text-slate-500">
                  {reviewSummary.totalReviews} reviews
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyReviewFilter("recent", null)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                reviewScope === "recent"
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"
              }`}
            >
              Recent
            </button>
            <button
              type="button"
              onClick={() => applyReviewFilter("all", null)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                reviewScope === "all" && reviewRatingFilter === null
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"
              }`}
            >
              All
            </button>
            {[5, 4, 3, 2, 1].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => applyReviewFilter("all", rating)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  reviewScope === "all" && reviewRatingFilter === rating
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"
                }`}
              >
                {rating}★
              </button>
            ))}
          </div>

          {reviewLoading ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Loading reviews...
            </div>
          ) : reviews.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No reviews yet. Be the first to share feedback.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span>{review.rating}★</span>
                      <span className="text-xs font-medium text-slate-500">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLikeToggle(review.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        review.likedByCustomer
                          ? "border-rose-300 bg-rose-50 text-rose-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"
                      }`}
                    >
                      Helpful · {review.likesCount}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {review.comment || "No comment provided."}
                  </p>
                </div>
              ))}
            </div>
          )}

          {reviewTotal > 10 ? (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setReviewPage((prev) => Math.max(1, prev - 1))}
                disabled={reviewPage === 1}
                className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                  reviewPage === 1
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-200 bg-white text-slate-700 hover:border-rose-200"
                }`}
              >
                Previous
              </button>
              <p className="text-xs font-semibold text-slate-500">
                Page {reviewPage} of {totalReviewPages}
              </p>
              <button
                type="button"
                onClick={() =>
                  setReviewPage((prev) => Math.min(totalReviewPages, prev + 1))
                }
                disabled={reviewPage >= totalReviewPages}
                className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                  reviewPage >= totalReviewPages
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-200 bg-white text-slate-700 hover:border-rose-200"
                }`}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <button
        type="button"
        onClick={() => setCartOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 flex items-center gap-3 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
        aria-label="Toggle cart"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs font-bold">
          {cartCount}
        </span>
        <span>{cartOpen ? "Hide cart" : "Show cart"}</span>
        <span className="text-xs font-medium text-slate-200">
          {formatPrice(total.toFixed(2), data.business.currencyCode)}
        </span>
      </button>

      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-200 ${
          cartOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto max-w-5xl rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Cart</p>
              <h2 className="font-display text-2xl text-slate-900">Your items</h2>
              <p className="text-sm text-slate-600">Saved locally for this table.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCartOpen((prev) => !prev)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {cartOpen ? "Hide cart" : "Show cart"}
              </button>
              <button
                type="button"
                onClick={clearCart}
                disabled={cart.length === 0}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  cart.length === 0
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Clear
              </button>
            </div>
          </div>

          {limitNotice && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              {limitNotice}
            </p>
          )}

          {cart.length === 0 ? (
            <p className="mt-6 text-sm text-slate-600">Your cart is empty.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-600">
                      {item.quantity} × {formatPrice(item.price, data.business.currencyCode)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-8 w-8 rounded-full border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      onClick={() => upsertItem(item, -1)}
                      aria-label={`Decrease ${item.name}`}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-full bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                      onClick={() => upsertItem(item, 1)}
                      aria-label={`Increase ${item.name}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      onClick={() => removeItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
                <p className="text-sm font-medium">Total</p>
                <p className="text-lg font-semibold">
                  {formatPrice(total.toFixed(2), data.business.currencyCode)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Customer details
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700" htmlFor="customer-name">
                      Name
                    </label>
                    <input
                      id="customer-name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Enter your name"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700" htmlFor="customer-phone">
                      Phone (optional)
                    </label>
                    <input
                      id="customer-phone"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="Phone number"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Payment method
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="payment-method"
                      value="razorpay"
                      checked={paymentMethod === "razorpay"}
                      onChange={() => setPaymentMethod("razorpay")}
                      className="h-4 w-4 text-slate-900"
                    />
                    Pay online (Razorpay)
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="payment-method"
                      value="cash"
                      checked={paymentMethod === "cash"}
                      onChange={() => setPaymentMethod("cash")}
                      className="h-4 w-4 text-slate-900"
                    />
                    Pay with cash
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={!canCheckout}
                className={`w-full rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition ${
                  canCheckout
                    ? "bg-slate-900 hover:bg-slate-800"
                    : "cursor-not-allowed bg-slate-300"
                }`}
              >
                {isSubmitting
                  ? "Starting checkout..."
                  : paymentMethod === "cash"
                    ? "Place cash order"
                    : "Order & pay"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
