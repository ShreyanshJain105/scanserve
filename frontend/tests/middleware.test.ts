import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

const buildRequest = (url: string, host: string) =>
  new NextRequest(url, {
    headers: {
      host,
    },
  });

describe("middleware host routing", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://scan2serve.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.scan2serve.com";
  });

  it("redirects public routes on app host back to site host", () => {
    const request = buildRequest(
      "https://app.scan2serve.com/menu/bistro?table=4",
      "app.scan2serve.com"
    );
    const response = middleware(request);

    expect(response?.headers.get("location")).toBe(
      "https://scan2serve.com/menu/bistro?table=4"
    );
  });

  it("redirects app routes on site host to app host", () => {
    const request = buildRequest(
      "https://scan2serve.com/dashboard",
      "scan2serve.com"
    );
    const response = middleware(request);

    expect(response?.headers.get("location")).toBe(
      "https://app.scan2serve.com/dashboard"
    );
  });
});
