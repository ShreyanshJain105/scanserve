import React from "react";
import { PublicSiteShell } from "../../components/public/public-site-shell";
import CustomerOrdersHub from "../../components/public/customer-orders-hub";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;

  return (
    <PublicSiteShell headerAudience="customer">
      <CustomerOrdersHub initialOrderId={orderId ?? null} />
    </PublicSiteShell>
  );
}
