import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrdersPage from "../src/app/dashboard/orders/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => "/dashboard/orders",
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../src/lib/toast", () => ({
  showToast: vi.fn(),
}));

describe("OrdersPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiFetchMock.mockReset();
    useAuthMock.mockReset();
  });

  it("loads orders and opens detail with actions", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: {
        id: "b1",
        userId: "u1",
        name: "Cafe",
        slug: "cafe",
        currencyCode: "USD",
        countryCode: "US",
        timezone: "America/New_York",
        description: null,
        logoUrl: null,
        address: "A",
        phone: "123",
        status: "approved",
        createdAt: "",
        updatedAt: "",
        rejections: [],
        businessRole: "owner",
      },
    });

    apiFetchMock.mockImplementation((url: string) => {
      if (url === "/api/business/analytics/overview") {
        return Promise.resolve({ section: "overview", timezone: "UTC", windows: {} });
      }
      if (url.startsWith("/api/business/orders?")) {
        return Promise.resolve({
          orders: [
            {
              id: "order_1",
              businessId: "b1",
              tableId: "t1",
              status: "pending",
              totalAmount: "12.00",
              paymentStatus: "pending",
              paymentMethod: "razorpay",
              razorpayOrderId: null,
              razorpayPaymentId: null,
              customerName: "Asha",
              customerPhone: null,
              createdAt: "",
              updatedAt: "",
              table: { id: "t1", tableNumber: 1, label: null },
            },
          ],
          nextCursor: null,
          hasMore: false,
          businessId: "b1",
        });
      }
      if (url === "/api/business/orders/order_1") {
        return Promise.resolve({
          order: {
            id: "order_1",
            businessId: "b1",
            tableId: "t1",
            status: "pending",
            totalAmount: "12.00",
            paymentStatus: "pending",
            paymentMethod: "razorpay",
            razorpayOrderId: null,
            razorpayPaymentId: null,
            customerName: "Asha",
            customerPhone: null,
            createdAt: "",
            updatedAt: "",
            table: { id: "t1", tableNumber: 1, label: null },
            items: [
              {
                id: "i1",
                menuItemId: "m1",
                name: "Tea",
                quantity: 1,
                unitPrice: "12.00",
                specialInstructions: null,
              },
            ],
          },
        });
      }
      if (url === "/api/business/orders/order_1/status") {
        return Promise.resolve({
          order: {
            id: "order_1",
            businessId: "b1",
            tableId: "t1",
            status: "confirmed",
            totalAmount: "12.00",
            paymentStatus: "pending",
            paymentMethod: "razorpay",
            razorpayOrderId: null,
            razorpayPaymentId: null,
            customerName: "Asha",
            customerPhone: null,
            createdAt: "",
            updatedAt: "",
            table: { id: "t1", tableNumber: 1, label: null },
          },
        });
      }
      return Promise.resolve({});
    });

    render(<OrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("#rder_1")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("#rder_1"));

    await waitFor(() => {
      expect(screen.getByText("Order details and actions")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Confirm order"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/orders/order_1/status",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });
});
