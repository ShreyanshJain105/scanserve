import { beforeEach, describe, expect, it, vi } from "vitest";
import RootPage from "../src/app/page";

const redirectMock = vi.fn();
const cookiesMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => redirectMock(...args),
}));

vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
}));

describe("RootPage", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    cookiesMock.mockReset();
    vi.restoreAllMocks();
  });

  it("redirects to /home when auth cookies are missing", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      getAll: () => [],
    });

    await RootPage();

    expect(redirectMock).toHaveBeenCalledWith("/home");
  });

  it("redirects to /explore when access token is present", async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "access_token" ? { value: "access" } : name === "refresh_token" ? { value: "refresh" } : undefined,
      getAll: () => [
        { name: "access_token", value: "access" },
        { name: "refresh_token", value: "refresh" },
      ],
    });

    await RootPage();

    expect(redirectMock).toHaveBeenCalledWith("/explore");
  });

  it("redirects to /explore when qr access token is present", async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "qr_customer_access" ? { value: "qr-access" } : undefined,
      getAll: () => [
        { name: "qr_customer_access", value: "qr-access" },
      ],
    });

    await RootPage();

    expect(redirectMock).toHaveBeenCalledWith("/explore");
  });
});
