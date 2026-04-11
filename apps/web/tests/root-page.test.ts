import { beforeEach, describe, expect, it, vi } from "vitest";
import RootPage from "../src/app/page";

const redirectMock = vi.fn();
const cookiesMock = vi.fn();
const headersMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => redirectMock(...args),
}));

vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
  headers: () => headersMock(),
}));

describe("RootPage", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    cookiesMock.mockReset();
    headersMock.mockReset();
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://scan2serve.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.scan2serve.com";
  });

  it("redirects to /home on site host when auth cookies are missing", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "host" ? "scan2serve.com" : null),
    });
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      getAll: () => [],
    });

    await RootPage();

    expect(redirectMock).toHaveBeenCalledWith("/home");
  });

  it("redirects to app dashboard on site host when access token is present", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "host" ? "scan2serve.com" : null),
    });
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "access_token" ? { value: "access" } : name === "refresh_token" ? { value: "refresh" } : undefined,
      getAll: () => [
        { name: "access_token", value: "access" },
        { name: "refresh_token", value: "refresh" },
      ],
    });

    await RootPage();

    expect(redirectMock).toHaveBeenCalledWith("https://app.scan2serve.com/dashboard");
  });

  it("redirects to /explore on site host when qr access token is present", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "host" ? "scan2serve.com" : null),
    });
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

  it("redirects to /dashboard on app host when business access token is present", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "host" ? "app.scan2serve.com" : null),
    });
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "access_token" ? { value: "access" } : undefined,
      getAll: () => [{ name: "access_token", value: "access" }],
    });

    await RootPage();

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("renders app landing on app host when no business token is present", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "host" ? "app.scan2serve.com" : null),
    });
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      getAll: () => [],
    });

    await RootPage();

    expect(redirectMock).not.toHaveBeenCalled();
  });
});
