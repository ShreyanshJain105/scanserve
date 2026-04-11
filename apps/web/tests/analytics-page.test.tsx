import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DashboardAnalyticsPage from "../src/app/dashboard/analytics/page";

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
  }),
  usePathname: () => "/dashboard/analytics",
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const showToastMock = vi.fn();
vi.mock("../src/lib/toast", () => ({
  showToast: (...args: unknown[]) => showToastMock(...args),
}));

const buildSummaryResponse = (section: "dashboard" | "orders", granularity: "summary") => ({
  section,
  timezone: "UTC",
  granularity,
  windows: {
    today: {
      window: "today",
      source: "postgres",
      status: "ok",
      summary:
        section === "dashboard"
          ? {
              totalOrders: 24,
              paidRevenue: "1200",
              avgPaidOrderValue: "50",
              orderGrowthPct: 12.5,
              revenueGrowthPct: 8.2,
              avgItemsPerOrder: 2.4,
              reviews: {
                averageRating: 4.7,
                totalReviews: 18,
                likesTotal: 9,
                likesPerReview: 0.5,
                reviewConversionPct: 32.1,
                ratingCounts: { 1: 1, 2: 1, 3: 2, 4: 5, 5: 9 },
              },
            }
          : {
              statusCounts: { pending: 3, completed: 12 },
              avgPrepMinutes: 18,
              cancellationRatePct: 4.5,
              paidOrderCount: 16,
              unpaidOrderCount: 2,
            },
    },
    lastWeek: {
      window: "lastWeek",
      source: "warehouse",
      status: "ok",
      summary:
        section === "dashboard"
          ? {
              totalOrders: 140,
              paidRevenue: "7200",
              avgPaidOrderValue: "51",
              orderGrowthPct: 6,
              revenueGrowthPct: 3,
              avgItemsPerOrder: 2.2,
            }
          : {
              statusCounts: { completed: 60 },
              avgPrepMinutes: 16,
              cancellationRatePct: 3.2,
              paidOrderCount: 58,
              unpaidOrderCount: 2,
            },
    },
  },
});

const buildDetailResponse = (section: "dashboard" | "orders", granularity: "detail") => ({
  section,
  timezone: "UTC",
  granularity,
  windows: {
    today: {
      window: "today",
      source: "postgres",
      status: "ok",
      detail:
        section === "dashboard"
          ? {
              ordersSeries: [
                { bucketStart: "2026-04-11T10:00:00Z", orderCount: 4, paidRevenue: "220" },
                { bucketStart: "2026-04-11T12:00:00Z", orderCount: 8, paidRevenue: "480" },
              ],
              revenueSeries: [
                { bucketStart: "2026-04-11T10:00:00Z", orderCount: 4, paidRevenue: "220" },
                { bucketStart: "2026-04-11T12:00:00Z", orderCount: 8, paidRevenue: "480" },
              ],
              newVsReturning: {
                newCustomers: 9,
                returningCustomers: 7,
                repeatRatePct: 43.8,
              },
              ordersPerActiveTable: 3.2,
              topCategories: [
                { categoryId: "c1", name: "Coffee", paidRevenue: "320", orderCount: 12 },
              ],
              topItems: [
                { itemId: "i1", name: "Latte", paidRevenue: "180", orderCount: 8 },
              ],
              reviews: {
                ratingCounts: { 1: 1, 2: 1, 3: 2, 4: 5, 5: 9 },
                series: [
                  {
                    bucketStart: "2026-04-11T10:00:00Z",
                    reviewCount: 2,
                    averageRating: 4.5,
                  },
                  {
                    bucketStart: "2026-04-11T12:00:00Z",
                    reviewCount: 3,
                    averageRating: 4.8,
                  },
                ],
              },
            }
          : {
              statusSeries: {
                completed: [
                  { bucketStart: "2026-04-11T10:00:00Z", orderCount: 4, paidRevenue: "220" },
                ],
              },
              statusLatencyMinutes: { completed: 14 },
              peakHours: [
                { hour: 12, orderCount: 5 },
              ],
              paymentMethodMix: [
                { method: "razorpay", orderCount: 10, paidRevenue: "520" },
              ],
              failedPaymentCount: 1,
              refundedCount: 0,
            },
    },
    lastWeek: {
      window: "lastWeek",
      source: "warehouse",
      status: "ok",
      detail:
        section === "dashboard"
          ? {
              ordersSeries: [],
              revenueSeries: [],
              newVsReturning: null,
              ordersPerActiveTable: null,
              topCategories: [],
              topItems: [],
            }
          : {
              statusSeries: {},
              statusLatencyMinutes: {},
              peakHours: [],
              paymentMethodMix: [],
              failedPaymentCount: 0,
              refundedCount: 0,
            },
    },
  },
});

describe("DashboardAnalyticsPage", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    apiFetchMock.mockReset();
    useAuthMock.mockReset();
    showToastMock.mockReset();
    window.history.replaceState(null, "", "/dashboard/analytics?interval=today");
  });

  it("renders analytics summary and review widgets", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      businesses: [
        {
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
      ],
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

    apiFetchMock.mockImplementation((url: string, options?: { body?: string }) => {
      if (url === "/api/business/analytics/dashboard") {
        const payload = options?.body ? JSON.parse(options.body) : {};
        if (payload.granularity === "summary") {
          return Promise.resolve(buildSummaryResponse("dashboard", "summary"));
        }
        return Promise.resolve(buildDetailResponse("dashboard", "detail"));
      }
      if (url === "/api/business/analytics/orders") {
        const payload = options?.body ? JSON.parse(options.body) : {};
        if (payload.granularity === "summary") {
          return Promise.resolve(buildSummaryResponse("orders", "summary"));
        }
        return Promise.resolve(buildDetailResponse("orders", "detail"));
      }
      return Promise.resolve({});
    });

    render(<DashboardAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Reviews pulse")).toBeInTheDocument();
    });

    expect(screen.getByText("4.70")).toBeInTheDocument();
    expect(screen.getByText("0.50")).toBeInTheDocument();
    expect(screen.getByText("32.1%")).toBeInTheDocument();
  });

  it("updates interval view when a window button is selected", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      businesses: [
        {
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
      ],
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

    apiFetchMock.mockImplementation((url: string, options?: { body?: string }) => {
      if (url === "/api/business/analytics/dashboard") {
        const payload = options?.body ? JSON.parse(options.body) : {};
        if (payload.granularity === "summary") {
          return Promise.resolve(buildSummaryResponse("dashboard", "summary"));
        }
        return Promise.resolve(buildDetailResponse("dashboard", "detail"));
      }
      if (url === "/api/business/analytics/orders") {
        const payload = options?.body ? JSON.parse(options.body) : {};
        if (payload.granularity === "summary") {
          return Promise.resolve(buildSummaryResponse("orders", "summary"));
        }
        return Promise.resolve(buildDetailResponse("orders", "detail"));
      }
      return Promise.resolve({});
    });

    render(<DashboardAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Revenue")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Last week" }));

    expect(screen.getByText("Snapshot for Last week.")).toBeInTheDocument();
    expect(window.location.search).toBe("?interval=lastWeek");
  });
});
