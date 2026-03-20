import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage from "../src/app/dashboard/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useAuthMock.mockReset();
  });

  it("shows onboarding call-to-action when no business profile exists", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      logout: vi.fn(),
      businesses: [],
      selectedBusiness: null,
      selectBusiness: vi.fn(),
      businessLoading: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Business onboarding required")).toBeTruthy();
    expect(screen.getByText("Start onboarding")).toBeTruthy();
  });

  it("shows locked overlay for pending business", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      logout: vi.fn(),
      businesses: [
        {
          id: "b1",
          userId: "u1",
          name: "My Cafe",
          slug: "my-cafe",
          currencyCode: "USD",
          description: null,
          logoUrl: null,
          address: "A",
          phone: "123456",
          status: "pending",
          createdAt: "",
          updatedAt: "",
          rejections: [],
        },
      ],
      selectedBusiness: {
        id: "b1",
        userId: "u1",
        name: "My Cafe",
        slug: "my-cafe",
        currencyCode: "USD",
        description: null,
        logoUrl: null,
        address: "A",
        phone: "123456",
        status: "pending",
        createdAt: "",
        updatedAt: "",
        rejections: [],
      },
      selectBusiness: vi.fn(),
      businessLoading: false,
    });

    render(<DashboardPage />);

    expect(screen.getAllByText("Pending admin approval").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Dashboard operations are disabled until this business is approved.")
    ).toBeTruthy();
  });
});
