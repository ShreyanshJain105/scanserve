import { beforeEach, describe, expect, it, vi } from "vitest";

const suggestMenuItemsMock = vi.fn();

vi.mock("../src/services/llmClient", () => ({
  getLlmClient: () => ({
    suggestMenuItems: suggestMenuItemsMock,
  }),
}));

import { getMenuItemSuggestions } from "../src/services/llmMenuSuggestions";

describe("getMenuItemSuggestions orchestration", () => {
  beforeEach(() => {
    suggestMenuItemsMock.mockReset();
  });

  it("requests a wider candidate set from LLM than the returned limit", async () => {
    suggestMenuItemsMock.mockResolvedValue([]);

    await getMenuItemSuggestions({
      categoryName: "Beverages",
      existingItemNames: [],
      limit: 5,
    });

    expect(suggestMenuItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 30,
      })
    );
  });

  it("fills from fallback when LLM suggestions are filtered out by existing items", async () => {
    suggestMenuItemsMock.mockResolvedValue([
      { label: "Lemon Iced Tea", confidence: 0.95, dietaryTags: ["vegan"] },
      { label: "Cold Coffee", confidence: 0.93, dietaryTags: ["vegetarian"] },
      { label: "Fresh Lime Soda", confidence: 0.91, dietaryTags: ["vegan"] },
      { label: "Mango Smoothie", confidence: 0.89, dietaryTags: ["vegetarian"] },
      { label: "Mint Mojito", confidence: 0.88, dietaryTags: ["vegan"] },
    ]);

    const suggestions = await getMenuItemSuggestions({
      categoryName: "Beverages",
      existingItemNames: [
        "Lemon Iced Tea",
        "Cold Coffee",
        "Fresh Lime Soda",
        "Mango Smoothie",
        "Mint Mojito",
      ],
      limit: 5,
    });

    expect(suggestions).toHaveLength(5);
    expect(suggestions.map((item) => item.label)).not.toContain("Lemon Iced Tea");
  });
});
