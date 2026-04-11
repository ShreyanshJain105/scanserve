import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NotificationsPage from "../src/app/dashboard/notifications/page";

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

describe("NotificationsPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      businessUser: { id: "u1", email: "biz@example.com", role: "business" },
      customerUser: null,
      loading: false,
    });
    apiFetchMock.mockResolvedValue({
      scope: "all",
      unreadCount: 1,
      notifications: [
        {
          id: "n1",
          inboxId: null,
          businessName: "Cafe Aurora",
          type: "UPDATE_APPROVED",
          message: "Profile approved",
          payload: { currencyCode: "USD" },
          createdAt: new Date().toISOString(),
        },
      ],
    });
  });

  it("renders notifications from API", async () => {
    render(<NotificationsPage />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.getByText("Profile approved")).toBeTruthy();
    expect(screen.getByText("Cafe Aurora")).toBeTruthy();
  });
});
