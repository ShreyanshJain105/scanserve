import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLlmClient } from "../src/services/llmClient";
import { getMenuItemSuggestions } from "../src/services/llmMenuSuggestions";

describe("LLM menu suggestions", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  it("returns the same singleton ai client instance", () => {
    const first = getLlmClient();
    const second = getLlmClient();
    expect(first).toBe(second);
  });

  it("falls back to deterministic suggestions when LLM is unavailable", async () => {
    const suggestions = await getMenuItemSuggestions({
      categoryName: "Beverages",
      existingItemNames: ["Lemon Iced Tea"],
      typedQuery: "mo",
      limit: 5,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.map((item) => item.label)).not.toContain("Lemon Iced Tea");
    expect(suggestions.some((item) => item.label.toLowerCase().includes("mo"))).toBe(true);
  });
});
