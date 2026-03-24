import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DashboardPage from "../src/app/dashboard/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => "/dashboard",
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
      archiveBusinessProfile: vi.fn(),
      restoreBusinessProfile: vi.fn(),
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
      archiveBusinessProfile: vi.fn(),
      restoreBusinessProfile: vi.fn(),
    });

    render(<DashboardPage />);

    expect(screen.getAllByText("Pending admin approval").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Dashboard operations are disabled until this business is approved.")
    ).toBeTruthy();
  });

  it("shows only archived businesses when archived filter is toggled on", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      logout: vi.fn(),
      businesses: [
        {
          id: "b1",
          userId: "u1",
          name: "Active Cafe",
          slug: "active-cafe",
          currencyCode: "USD",
          description: null,
          logoUrl: "http://localhost/logo.png",
          address: "A",
          phone: "123456",
          status: "approved",
          archivedAt: null,
          createdAt: "",
          updatedAt: "",
          rejections: [],
        },
        {
          id: "b2",
          userId: "u1",
          name: "Old Cafe",
          slug: "old-cafe",
          currencyCode: "USD",
          description: null,
          logoUrl: null,
          address: "A",
          phone: "123456",
          status: "archived",
          archivedAt: "",
          createdAt: "",
          updatedAt: "",
          rejections: [],
        },
      ],
      selectedBusiness: {
        id: "b1",
        userId: "u1",
        name: "Active Cafe",
        slug: "active-cafe",
        currencyCode: "USD",
        description: null,
        logoUrl: "http://localhost/logo.png",
        address: "A",
        phone: "123456",
        status: "approved",
        archivedAt: null,
        createdAt: "",
        updatedAt: "",
        rejections: [],
      },
      selectBusiness: vi.fn(),
      businessLoading: false,
      archiveBusinessProfile: vi.fn(),
      restoreBusinessProfile: vi.fn(),
    });

    render(<DashboardPage />);

    expect(screen.queryByText("Old Cafe")).toBeNull();
    expect(screen.getByText("Active Cafe")).toBeTruthy();
    expect(screen.getByAltText("Active Cafe logo")).toBeTruthy();
    fireEvent.click(screen.getByText("Show archived"));
    expect(screen.getByText("Old Cafe")).toBeTruthy();
    expect(screen.queryByText("Active Cafe")).toBeNull();
    expect(screen.queryByText("Manage menu")).toBeNull();
    expect(screen.queryByLabelText("Edit business details")).toBeNull();
    expect(screen.queryByText("Archive business")).toBeNull();
    const archivedChip = screen.getByText("archived");
    expect(archivedChip.className.includes("bg-red-100")).toBe(true);
  });
});
