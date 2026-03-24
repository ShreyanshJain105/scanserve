import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HomePage from "../src/app/home/page";

const pushMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/home",
}));

vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

describe("HomePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useAuthMock.mockReset();
  });

  it("does not render standalone login/logout action buttons in home body", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
    });

    render(<HomePage />);

    expect(screen.getByText("Scan2Serve")).toBeTruthy();
    expect(screen.queryByText("Welcome back")).toBeNull();
    expect(screen.queryByRole("button", { name: "Login" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Logout" })).toBeNull();
  });

  it("shows profile section with one role CTA when user is loaded", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
    });

    render(<HomePage />);

    expect(screen.getByText("Profile")).toBeTruthy();
    fireEvent.click(screen.getByText("Go to dashboard"));
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText("Go to admin")).toBeNull();
  });
});
