import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import HomePage from "../src/app/home/page";

const pushMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

describe("HomePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useAuthMock.mockReset();
  });

  it("opens login dialog from hero CTA for unauthenticated users", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      logout: vi.fn(),
    });

    render(<HomePage />);

    expect(screen.getByText("Scan2Serve")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Login")[0]);
    expect(screen.getByText("Welcome back")).toBeTruthy();
  });

  it("shows profile section with one role CTA when user is loaded", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      logout: vi.fn(),
    });

    render(<HomePage />);

    expect(screen.getByText("Profile")).toBeTruthy();
    fireEvent.click(screen.getByText("Go to dashboard"));
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText("Go to admin")).toBeNull();
  });
});
