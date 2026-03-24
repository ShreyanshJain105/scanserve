import React from "react";
import { PublicSiteShell } from "../../../components/public/public-site-shell";

type OrderApiResponse = {
  status: 1 | 0;
  data?: {
    business: { name: string; currencyCode: string } | null;
    order: {
      id: string;
      businessId: string;
      tableId: string;
      status: string;
      totalAmount: string;
      paymentStatus: string;
      createdAt: string;
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
  error?: { message: string };
};

const formatCurrency = (value: string, currency: string) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(numeric);
};

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const apiBase =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4000";

  const res = await fetch(`${apiBase}/api/public/orders/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const body = (await res.json()) as OrderApiResponse;

  if (!res.ok || body.status !== 1 || !body.data) {
    const message = body.error?.message || "Order details are unavailable right now.";
    return (
      <PublicSiteShell headerAudience="customer">
        <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 className="font-display text-3xl text-slate-900">Order unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
        </section>
      </PublicSiteShell>
    );
  }

  const { order, items, business } = body.data;
  const currency = business?.currencyCode || "USD";
  const createdAt = new Date(order.createdAt);

  return (
    <PublicSiteShell headerAudience="customer">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order</p>
        <h1 className="mt-2 font-display text-3xl text-slate-900">
          {business?.name ? `${business.name} order` : "Order status"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Placed {createdAt.toLocaleString()}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 capitalize">
              {order.status}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Payment
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 capitalize">
              {order.paymentStatus}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Total
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatCurrency(order.totalAmount, currency)}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Items</p>
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {item.name || "Menu item"}
                </p>
                <p className="text-xs text-slate-600">
                  {item.quantity} × {formatCurrency(item.unitPrice, currency)}
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {formatCurrency(
                  (Number(item.unitPrice) * item.quantity).toFixed(2),
                  currency
                )}
              </p>
            </div>
          ))}
        </div>
      </section>
    </PublicSiteShell>
  );
}
