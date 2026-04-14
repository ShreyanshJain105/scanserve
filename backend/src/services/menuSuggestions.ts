import { DIETARY_TAGS, type DietaryTag } from "../shared";

type CategorySuggestion = {
  label: string;
  confidence: number;
};

type ItemSuggestion = {
  label: string;
  confidence: number;
  dietaryTags: DietaryTag[];
};

const COMMON_CATEGORY_SUGGESTIONS = [
  "Starters",
  "Main Course",
  "Sides",
  "Beverages",
  "Desserts",
  "Salads",
  "Soups",
  "Breakfast",
  "Snacks",
  "Combos",
];

const CATEGORY_ITEM_SUGGESTIONS: Record<string, ItemSuggestion[]> = {
  starters: [
    { label: "Garlic Bread", confidence: 0.95, dietaryTags: ["vegetarian"] },
    { label: "Spring Rolls", confidence: 0.92, dietaryTags: ["vegetarian"] },
    { label: "Chicken Wings", confidence: 0.91, dietaryTags: ["halal"] },
    { label: "Bruschetta", confidence: 0.9, dietaryTags: ["vegetarian"] },
    { label: "Nachos", confidence: 0.88, dietaryTags: ["vegetarian"] },
  ],
  "main course": [
    { label: "Grilled Chicken", confidence: 0.95, dietaryTags: ["halal"] },
    { label: "Paneer Butter Masala", confidence: 0.93, dietaryTags: ["vegetarian"] },
    { label: "Veg Biryani", confidence: 0.91, dietaryTags: ["vegetarian"] },
    { label: "Margherita Pizza", confidence: 0.9, dietaryTags: ["vegetarian"] },
    { label: "Spaghetti Arrabbiata", confidence: 0.88, dietaryTags: ["vegan", "spicy"] },
  ],
  sides: [
    { label: "French Fries", confidence: 0.95, dietaryTags: ["vegetarian"] },
    { label: "Mashed Potatoes", confidence: 0.92, dietaryTags: ["vegetarian"] },
    { label: "Steamed Vegetables", confidence: 0.9, dietaryTags: ["vegan"] },
    { label: "Onion Rings", confidence: 0.89, dietaryTags: ["vegetarian"] },
    { label: "Coleslaw", confidence: 0.87, dietaryTags: ["vegetarian"] },
  ],
  beverages: [
    { label: "Lemon Iced Tea", confidence: 0.95, dietaryTags: ["vegan"] },
    { label: "Cold Coffee", confidence: 0.93, dietaryTags: ["vegetarian"] },
    { label: "Fresh Lime Soda", confidence: 0.91, dietaryTags: ["vegan"] },
    { label: "Mango Smoothie", confidence: 0.89, dietaryTags: ["vegetarian"] },
    { label: "Mint Mojito", confidence: 0.88, dietaryTags: ["vegan"] },
  ],
  desserts: [
    { label: "Chocolate Brownie", confidence: 0.95, dietaryTags: ["vegetarian"] },
    { label: "Cheesecake", confidence: 0.93, dietaryTags: ["vegetarian"] },
    { label: "Ice Cream Sundae", confidence: 0.91, dietaryTags: ["vegetarian"] },
    { label: "Fruit Salad", confidence: 0.89, dietaryTags: ["vegan", "gluten-free"] },
    { label: "Gulab Jamun", confidence: 0.88, dietaryTags: ["vegetarian"] },
  ],
};

const DEFAULT_ITEM_SUGGESTIONS: ItemSuggestion[] = Object.values(CATEGORY_ITEM_SUGGESTIONS)
  .flat()
  .reduce<ItemSuggestion[]>((acc, item) => {
    if (acc.some((entry) => entry.label.toLowerCase() === item.label.toLowerCase())) {
      return acc;
    }
    acc.push(item);
    return acc;
  }, [])
  .sort((a, b) => b.confidence - a.confidence);

const normalize = (value: string) => value.trim().toLowerCase();

const validDietaryTags = new Set<string>(DIETARY_TAGS);

const sanitizeDietaryTags = (tags: string[]): DietaryTag[] =>
  tags.filter((tag): tag is DietaryTag => validDietaryTags.has(tag));

export const suggestCategories = (existingCategoryNames: string[]): CategorySuggestion[] => {
  const existing = new Set(existingCategoryNames.map(normalize));
  return COMMON_CATEGORY_SUGGESTIONS
    .filter((name) => !existing.has(normalize(name)))
    .slice(0, 5)
    .map((label, index) => ({
      label,
      confidence: Number((0.95 - index * 0.03).toFixed(2)),
    }));
};

export const suggestItems = (
  categoryName: string,
  existingItemNames: string[]
): ItemSuggestion[] => {
  const key = normalize(categoryName);
  const existing = new Set(existingItemNames.map(normalize));
  const scopedSuggestions = (CATEGORY_ITEM_SUGGESTIONS[key] ?? []).filter(
    (item) => !existing.has(normalize(item.label))
  );
  const fallbackSuggestions = DEFAULT_ITEM_SUGGESTIONS.filter(
    (item) =>
      !existing.has(normalize(item.label)) &&
      !scopedSuggestions.some((entry) => normalize(entry.label) === normalize(item.label))
  );

  return [...scopedSuggestions, ...fallbackSuggestions].slice(0, 10).map((item) => ({
    ...item,
    dietaryTags: sanitizeDietaryTags(item.dietaryTags),
  }));
};
