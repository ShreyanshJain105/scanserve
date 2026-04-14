import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("aiImageProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns image buffer for gemini provider inline image response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";
    process.env.GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: Buffer.from("fake-image").toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    const { generateMenuItemImage } = await import("../src/services/aiImageProvider");
    const result = await generateMenuItemImage({
      prompt: "A plated burger",
      itemName: "Burger",
      categoryName: "Main",
    });

    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe("image/png");
    expect(result?.buffer.length).toBeGreaterThan(0);
  });

  it("returns null for gemini provider when config is missing", async () => {
    process.env.GEMINI_API_KEY = "";

    const fetchSpy = vi.spyOn(global, "fetch");
    const { generateMenuItemImage } = await import("../src/services/aiImageProvider");
    const result = await generateMenuItemImage({
      prompt: "A plated burger",
      itemName: "Burger",
      categoryName: "Main",
    });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses gemini generation regardless of AI_IMAGE_PROVIDER value", async () => {
    process.env.AI_IMAGE_PROVIDER = "unknown-provider";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: Buffer.from("fake-image").toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    const { generateMenuItemImage } = await import("../src/services/aiImageProvider");
    const result = await generateMenuItemImage({
      prompt: "A plated burger",
      itemName: "Burger",
      categoryName: "Main",
    });

    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe("image/png");
  });
});
