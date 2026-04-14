import { DIETARY_TAGS, type DietaryTag } from "../shared";
import { suggestItems } from "./menuSuggestions";
import { getLlmClient } from "./llmClient";
import { logger } from "../utils/logger";

type ItemSuggestion = {
  label: string;
  confidence: number;
  dietaryTags: DietaryTag[];
};

type SuggestionInput = {
  categoryName: string;
  existingItemNames: string[];
  typedQuery?: string;
  limit?: number;
};

const validDietaryTags = new Set<string>(DIETARY_TAGS);
const normalize = (value: string) => value.trim().toLowerCase();

const sanitize = (value: ItemSuggestion): ItemSuggestion => ({
  ...value,
  dietaryTags: value.dietaryTags.filter((tag): tag is DietaryTag => validDietaryTags.has(tag)),
  confidence: Number(Math.min(1, Math.max(0, value.confidence)).toFixed(2)),
});

const applyTypedQuery = (suggestions: ItemSuggestion[], typedQuery?: string) => {
  const q = typedQuery?.trim().toLowerCase();
  if (!q) return suggestions;

  const prefix = suggestions.filter((item) => item.label.toLowerCase().startsWith(q));
  const contains = suggestions.filter(
    (item) => !item.label.toLowerCase().startsWith(q) && item.label.toLowerCase().includes(q)
  );
  return [...prefix, ...contains];
};

const dedupeByLabel = (suggestions: ItemSuggestion[]) => {
  const seen = new Set<string>();
  const output: ItemSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = normalize(suggestion.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(suggestion);
  }
  return output;
};

export const getMenuItemSuggestions = async (input: SuggestionInput): Promise<ItemSuggestion[]> => {
  const limit = Math.min(10, Math.max(1, input.limit ?? 5));
  const llmCandidateLimit = Math.min(50, Math.max(20, limit * 6));
  const existingSet = new Set(input.existingItemNames.map(normalize));
  const llm = getLlmClient();
  const llmOutput = await llm.suggestMenuItems({
    categoryName: input.categoryName,
    existingItemNames: input.existingItemNames,
    typedQuery: input.typedQuery,
    limit: llmCandidateLimit,
  });

  const fallbackSuggestions = suggestItems(input.categoryName, input.existingItemNames);
  const baseSuggestions = llmOutput && llmOutput.length > 0 ? llmOutput : fallbackSuggestions;

  if (!llmOutput || llmOutput.length === 0) {
    logger.info("ai.menu_suggestions.fallback_used", {
      categoryName: input.categoryName,
      typedQuery: input.typedQuery?.trim() || null,
      limit,
      llmCandidateLimit,
    });
  }

  const filtered = dedupeByLabel(
    baseSuggestions
      .map(sanitize)
      .filter((item) => !existingSet.has(normalize(item.label)))
  );
  const ranked = applyTypedQuery(filtered, input.typedQuery);

  if (ranked.length >= limit) {
    return ranked.slice(0, limit);
  }

  const fallbackRanked = applyTypedQuery(
    dedupeByLabel(
      fallbackSuggestions
        .map(sanitize)
        .filter((item) => !existingSet.has(normalize(item.label)))
    ),
    input.typedQuery
  );

  const merged = dedupeByLabel([...ranked, ...fallbackRanked])
    .map(sanitize)
    .filter((item) => !existingSet.has(normalize(item.label)));
  return merged.slice(0, limit);
};
