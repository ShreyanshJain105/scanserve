import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrgCreatePage from "../src/app/dashboard/org/create/page";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => "/dashboard/org/create",
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("../src/lib/toast", () => ({
  showToast: vi.fn(),
}));

describe("OrgCreatePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReset();
    apiFetchMock.mockReset();
  });

  it("creates org and redirects to dashboard", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
    });

    apiFetchMock
      .mockResolvedValueOnce({ membership: null })
      .mockResolvedValueOnce({ org: { id: "org_1" } });

    render(<OrgCreatePage />);

    const nameInput = await screen.findByPlaceholderText("Example: Horizon Foods");
    fireEvent.change(nameInput, {
      target: { value: "Horizon Foods" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create org" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/business/org", {
        method: "POST",
        body: JSON.stringify({ name: "Horizon Foods" }),
      });
    });
    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to dashboard when org already exists", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
    });
    apiFetchMock.mockResolvedValueOnce({
      membership: { id: "m1", orgId: "org_1", role: "owner" },
    });

    render(<OrgCreatePage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard");
    });
  });
});
