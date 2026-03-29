import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "../src/app/dashboard/page";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => "/dashboard",
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReset();
    apiFetchMock.mockReset();
  });

  it("routes users to org create page when no org exists", async () => {
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
    apiFetchMock.mockResolvedValueOnce({ membership: null });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/org/create");
    });
  });

  it("redirects owners to onboarding when org exists but no businesses", async () => {
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
    apiFetchMock.mockResolvedValueOnce({ membership: { id: "m1", orgId: "o1", isOwner: true } });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/onboarding");
    });
  });

  it("shows waiting message for non-owners with no businesses", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "staff@example.com", role: "business" },
      loading: false,
      logout: vi.fn(),
      businesses: [],
      selectedBusiness: null,
      selectBusiness: vi.fn(),
      businessLoading: false,
      archiveBusinessProfile: vi.fn(),
      restoreBusinessProfile: vi.fn(),
    });
    apiFetchMock.mockResolvedValueOnce({ membership: { id: "m1", orgId: "o1", isOwner: false } });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Waiting for business access")).toBeTruthy();
    });
    expect(screen.queryByText("Create your first business")).toBeNull();
  });

  it("shows locked overlay for pending business", async () => {
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
    apiFetchMock.mockResolvedValueOnce({ membership: { id: "m1", orgId: "o1", isOwner: true } });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Pending admin approval").length).toBeGreaterThan(0);
    });
    expect(
      screen.getByText("Dashboard operations are disabled until this business is approved.")
    ).toBeTruthy();
  });

  it("opens invite dialog from quick actions", async () => {
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
          status: "approved",
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
        status: "approved",
        createdAt: "",
        updatedAt: "",
        rejections: [],
      },
      selectBusiness: vi.fn(),
      businessLoading: false,
      archiveBusinessProfile: vi.fn(),
      restoreBusinessProfile: vi.fn(),
    });
    apiFetchMock.mockResolvedValueOnce({ membership: { id: "m1", orgId: "o1", isOwner: true } });

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText("Invite team member")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Invite team member"));
    expect(screen.getByText("Invite to org")).toBeTruthy();
  });

  it("shows only archived businesses when archived filter is toggled on", async () => {
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
    apiFetchMock.mockResolvedValueOnce({ membership: { id: "m1", orgId: "o1", isOwner: true } });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Active Cafe")).toBeTruthy();
    });
    expect(screen.queryByText("Old Cafe")).toBeNull();
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
