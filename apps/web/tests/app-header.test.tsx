import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppHeader } from "../src/components/layout/app-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));
const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe("AppHeader", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    apiFetchMock.mockReset();
  });

  it("hides dashboard CTA in customer audience mode", () => {
    useAuthMock.mockReturnValue({
      loading: false,
      user: { id: "c1", email: "cust@example.com", role: "customer" },
      businessUser: { id: "u1", email: "biz@example.com", role: "business" },
      customerUser: { id: "c1", email: "cust@example.com", role: "customer" },
      logoutBusiness: vi.fn(),
      logoutCustomer: vi.fn(),
      logoutAll: vi.fn(),
    });

    render(<AppHeader audience="customer" />);

    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.getByText("Login")).toBeTruthy();
    fireEvent.click(screen.getByText("Login"));
    expect(screen.queryByText("Login as business")).toBeNull();
    expect(screen.getByText("Login as customer")).toBeTruthy();
    fireEvent.click(screen.getByText("cust@example.com"));
    expect(screen.getByText("Logout customer")).toBeTruthy();
  });

  it("shows only business login action in default audience mode", async () => {
    useAuthMock.mockReturnValue({
      loading: false,
      user: { id: "u1", email: "biz@example.com", role: "business" },
      businessUser: { id: "u1", email: "biz@example.com", role: "business" },
      customerUser: null,
      logoutBusiness: vi.fn(),
      logoutCustomer: vi.fn(),
      logoutAll: vi.fn(),
    });
    apiFetchMock.mockResolvedValue({
      scope: "unread",
      unreadCount: 2,
      notifications: [
        { id: "n1", inboxId: "i1", businessName: "B1", message: "Hi", type: "UPDATE_APPROVED", createdAt: new Date().toISOString() },
        { id: "n2", inboxId: "i2", businessName: "B1", message: "Hi2", type: "UPDATE_APPROVED", createdAt: new Date().toISOString() },
      ],
    });

    render(<AppHeader audience="default" />);

    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("Login")).toBeNull();
    fireEvent.click(screen.getByText("biz@example.com"));
    expect(screen.getByText("Logout business")).toBeTruthy();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("fetches admin notifications when admin user is active", async () => {
    useAuthMock.mockReturnValue({
      loading: false,
      user: { id: "a1", email: "admin@example.com", role: "admin" },
      businessUser: null,
      customerUser: null,
      logoutBusiness: vi.fn(),
      logoutCustomer: vi.fn(),
      logoutAll: vi.fn(),
    });
    apiFetchMock.mockResolvedValue({
      scope: "unread",
      unreadCount: 1,
      notifications: [
        {
          id: "n1",
          inboxId: "i1",
          businessName: "B1",
          message: "New business submitted",
          type: "BUSINESS_SUBMITTED",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<AppHeader audience="default" />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("shows org invite link from notification payload", async () => {
    useAuthMock.mockReturnValue({
      loading: false,
      user: { id: "u1", email: "biz@example.com", role: "business" },
      businessUser: { id: "u1", email: "biz@example.com", role: "business" },
      customerUser: null,
      logoutBusiness: vi.fn(),
      logoutCustomer: vi.fn(),
      logoutAll: vi.fn(),
    });
    apiFetchMock.mockResolvedValue({
      scope: "unread",
      unreadCount: 1,
      notifications: [
        {
          id: "n1",
          inboxId: "i1",
          businessName: "Org",
          message: "Invite",
          type: "ORG_INVITE_RECEIVED",
          payload: { inviteId: "invite_123" },
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<AppHeader audience="default" />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("Notifications"));
    await waitFor(() => {
      expect(screen.getByText("View org invite")).toBeTruthy();
    });
  });
});
