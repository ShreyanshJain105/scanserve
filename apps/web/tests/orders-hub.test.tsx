import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CustomerOrdersHub from "../src/components/public/customer-orders-hub";

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("../src/lib/toast", () => ({
  showToast: vi.fn(),
}));

describe("CustomerOrdersHub", () => {
  it("renders orders and loads selected order details", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/public/orders?")) {
        return Promise.resolve({
          orders: [
            {
              id: "order-2",
              businessId: "b2",
              tableId: "t2",
              status: "pending",
              totalAmount: "20.00",
              paymentStatus: "pending",
              paymentMethod: "razorpay",
              createdAt: "2026-03-30T10:00:00.000Z",
              updatedAt: "2026-03-30T10:00:00.000Z",
              business: { id: "b2", name: "Bravo", currencyCode: "USD" },
            },
          ],
          nextCursor: null,
        });
      }
      if (path.startsWith("/api/public/orders/order-2")) {
        return Promise.resolve({
          business: { name: "Bravo", currencyCode: "USD" },
          order: {
            id: "order-2",
            businessId: "b2",
            tableId: "t2",
            status: "pending",
            totalAmount: "20.00",
            paymentStatus: "pending",
            paymentMethod: "razorpay",
            createdAt: "2026-03-30T10:00:00.000Z",
          },
          items: [
            {
              id: "oi-1",
              menuItemId: "m1",
              name: "Latte",
              quantity: 2,
              unitPrice: "5.00",
              specialInstructions: null,
            },
          ],
        });
      }
      return Promise.reject(new Error("Unknown request"));
    });

    render(<CustomerOrdersHub initialOrderId="order-2" />);

    expect(await screen.findByText("Order hub")).toBeTruthy();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(await screen.findByText("Bravo")).toBeTruthy();
    const detailSection = await screen.findByText("Order detail");
    const detailPanel = detailSection.closest("div") ?? detailSection.parentElement!;
    expect(within(detailPanel).getAllByText("pending").length).toBeGreaterThan(0);
    expect(await screen.findByText("Latte")).toBeTruthy();
    expect(within(detailPanel).getAllByText("$20.00").length).toBeGreaterThan(0);
  });
});
