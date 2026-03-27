import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ExplorePage from "../src/app/explore/page";

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/explore",
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

describe("ExplorePage", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({
      loading: false,
      user: null,
      businessUser: null,
      customerUser: null,
      logoutBusiness: vi.fn(),
      logoutCustomer: vi.fn(),
      logoutAll: vi.fn(),
    });
  });

  it("renders explore content and routes to onboarding", () => {
    render(<ExplorePage />);
    expect(screen.getByText("Everything your restaurant needs, connected.")).toBeTruthy();
    fireEvent.click(screen.getByText("Create org"));
    expect(pushMock).toHaveBeenCalledWith("/dashboard/org/create");
    fireEvent.click(screen.getByText("Back to home"));
    expect(pushMock).toHaveBeenCalledWith("/home");
  });
});
