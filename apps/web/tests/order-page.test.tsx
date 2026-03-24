import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrderStatusPage from "../src/app/order/[id]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/order/order-1",
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe("OrderStatusPage", () => {
  it("renders order details from API response", async () => {
    useAuthMock.mockReturnValue({
      loading: false,
      user: null,
      businessUser: null,
      customerUser: null,
      logoutBusiness: vi.fn(),
      logoutCustomer: vi.fn(),
      logoutAll: vi.fn(),
    });
    apiFetchMock.mockResolvedValue({ scope: "unread", unreadCount: 0, notifications: [] });

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        data: {
          business: { name: "Cafe Aurora", currencyCode: "USD" },
          order: {
            id: "order-1",
            businessId: "b1",
            tableId: "t1",
            status: "confirmed",
            totalAmount: "12.50",
            paymentStatus: "paid",
            createdAt: new Date("2026-03-24T10:00:00.000Z").toISOString(),
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
        },
      }),
    } as Response);

    const element = await OrderStatusPage({ params: Promise.resolve({ id: "order-1" }) });
    render(element);

    expect(screen.getByText("Cafe Aurora order")).toBeTruthy();
    expect(screen.getByText("confirmed")).toBeTruthy();
    expect(screen.getByText("paid")).toBeTruthy();
    expect(screen.getByText("Latte")).toBeTruthy();
    expect(screen.getByText("$12.50")).toBeTruthy();
  });
});
