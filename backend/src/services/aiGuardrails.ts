type GuardrailCategory =
  | "self_harm"
  | "sexual_minors"
  | "explicit_violence"
  | "hate_harassment"
  | "illegal_instructions"
  | "prompt_injection";

type UnsafeMatch = {
  category: GuardrailCategory;
  pattern: RegExp;
};

const unsafePatterns: UnsafeMatch[] = [
  { category: "self_harm", pattern: /\b(suicide|self-harm|kill myself|end my life)\b/i },
  { category: "sexual_minors", pattern: /\b(child porn|minor sexual|underage sex)\b/i },
  { category: "explicit_violence", pattern: /\b(gore|beheading|dismember|torture)\b/i },
  { category: "hate_harassment", pattern: /\b(genocide|ethnic cleansing|racial slur)\b/i },
  {
    category: "illegal_instructions",
    pattern: /\b(how to make (a )?bomb|build (a )?weapon|explosive recipe)\b/i,
  },
  {
    category: "prompt_injection",
    pattern: /\b(ignore (all )?(previous|prior) instructions|bypass (safety|guardrails))\b/i,
  },
];

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const checkUnsafeContent = (input: string): { unsafe: boolean; category?: GuardrailCategory } => {
  const text = collapseWhitespace(input);
  if (!text) return { unsafe: false };
  const match = unsafePatterns.find((entry) => entry.pattern.test(text));
  if (!match) return { unsafe: false };
  return { unsafe: true, category: match.category };
};

export const checkGenerationInputSafety = (
  fields: Array<string | null | undefined>
): { safe: boolean; category?: GuardrailCategory } => {
  for (const field of fields) {
    const content = (field || "").trim();
    if (!content) continue;
    const check = checkUnsafeContent(content);
    if (check.unsafe) {
      return { safe: false, category: check.category };
    }
  }
  return { safe: true };
};

export const sanitizeGeneratedText = (input: string, maxLength = 300): string => {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`/g, "")
    .replace(/[_*#~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};
