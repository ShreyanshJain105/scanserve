import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/lib/auth-context";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../src/lib/api";

const apiFetchMock = apiFetch as unknown as vi.Mock;

const Harness = () => {
  const { user, loading, login, error } = useAuth();
  return (
    <div>
      <span data-testid="status">{loading ? "loading" : user ? user.email : "anon"}</span>
      {error && <span data-testid="error">{error}</span>}
      <button
        onClick={() => {
          void login({ email: "a@b.com", password: "password123" }).catch(() => undefined);
        }}
        data-testid="login"
      >
        login
      </button>
    </div>
  );
};

describe("AuthProvider", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("logs in and stores user", async () => {
    // Initial /sessions and /me calls reject
    apiFetchMock.mockRejectedValueOnce(new Error("unauth"));
    apiFetchMock.mockRejectedValueOnce(new Error("unauth"));
    // login call
    apiFetchMock.mockResolvedValueOnce({
      user: { id: "1", email: "a@b.com", role: "customer", createdAt: "" },
    });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("anon");
    });

    fireEvent.click(screen.getByTestId("login"));

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("a@b.com");
    });
  });

  it("blocks business login call when business session already exists", async () => {
    apiFetchMock.mockResolvedValueOnce({
      businessUser: { id: "b1", email: "biz@x.com", role: "business", createdAt: "" },
      customerUser: null,
      activeScope: "business",
    });
    apiFetchMock.mockResolvedValueOnce({
      user: { id: "b1", email: "biz@x.com", role: "business", createdAt: "" },
    });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("biz@x.com");
    });

    fireEvent.click(screen.getByTestId("login"));

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toContain("Already logged in");
    });
    expect(apiFetchMock.mock.calls.some((call) => call[0] === "/api/auth/login")).toBe(false);
  });
});
