import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DashboardTablesPage from "../src/app/dashboard/tables/page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/dashboard/tables",
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
}));

describe("DashboardTablesPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useAuthMock.mockReset();
    apiFetchMock.mockReset();
  });

  it("shows role guard for non-business users", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "admin@example.com", role: "admin" },
      loading: false,
      selectedBusiness: null,
    });

    render(<DashboardTablesPage />);
    expect(screen.getByText("Only business users can manage tables.")).toBeTruthy();
  });

  it("loads table list for approved business", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/business/tables?")) {
        return Promise.resolve({
          tables: [
            {
              id: "t1",
              businessId: "b1",
              tableNumber: 1,
              label: "Table 1",
              isActive: true,
              createdAt: new Date().toISOString(),
              lastRotatedAt: null,
              qrCode: { id: "q1", uniqueCode: "token-1", createdAt: new Date().toISOString() },
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        });
      }
      return Promise.resolve({});
    });

    render(<DashboardTablesPage />);

    await waitFor(() => {
      expect(screen.getByText("Table 1")).toBeTruthy();
      expect(screen.getByText("Token: token-1")).toBeTruthy();
    });
  });

  it("submits bulk create request", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith("/api/business/tables?") && options?.method === "GET") {
        return Promise.resolve({ tables: [], total: 0, page: 1, limit: 20 });
      }
      if (path === "/api/business/tables/bulk" && options?.method === "POST") {
        return Promise.resolve({ createdCount: 5 });
      }
      return Promise.resolve({});
    });

    render(<DashboardTablesPage />);

    await waitFor(() => {
      expect(screen.getByText("Create tables")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Count"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Create tables"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/tables/bulk",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
