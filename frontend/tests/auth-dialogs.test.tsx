import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "../src/app/(auth)/login/page";
import BusinessRegisterPage from "../src/app/(auth)/register/business/page";
import QrLoginPage from "../src/app/qr/login/page";
import QrRegisterPage from "../src/app/qr/register/page";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/login",
  useSearchParams: () =>
    new URLSearchParams({
      token: "valid-qr-live-token-123456",
    }),
}));

vi.mock("../src/components/public/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

describe("Auth dialogs", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReset();
  });

  it("shows close button on business auth dialogs", () => {
    useAuthMock.mockReturnValue({
      businessUser: null,
      customerUser: null,
      login: vi.fn(),
      register: vi.fn(),
      error: null,
    });

    render(<LoginPage />);
    expect(screen.getByLabelText("Close dialog")).toBeTruthy();

    render(<BusinessRegisterPage />);
    expect(screen.getAllByLabelText("Close dialog").length).toBeGreaterThan(0);
  });

  it("shows close button on QR auth dialogs", () => {
    useAuthMock.mockReturnValue({
      businessUser: null,
      customerUser: null,
      loginCustomerFromQr: vi.fn(),
      registerCustomerFromQr: vi.fn(),
      error: null,
    });

    render(<QrLoginPage />);
    expect(screen.getByLabelText("Close dialog")).toBeTruthy();

    render(<QrRegisterPage />);
    expect(screen.getAllByLabelText("Close dialog").length).toBeGreaterThan(0);
  });
});
