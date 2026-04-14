import { DIETARY_TAGS, type DietaryTag } from "../shared";
import { logger } from "../utils/logger";

type LlmItemSuggestion = {
  label: string;
  confidence: number;
  dietaryTags: DietaryTag[];
};

type RequestPayload = {
  categoryName: string;
  existingItemNames: string[];
  typedQuery?: string;
  limit: number;
};

type DescriptionPayload = {
  categoryName: string;
  itemName: string;
  dietaryTags?: string[];
  tone?: "neutral" | "premium" | "casual";
};

type RawSuggestion = {
  label?: unknown;
  confidence?: unknown;
  dietaryTags?: unknown;
};

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 4500;
const validDietaryTags = new Set<string>(DIETARY_TAGS);

class LlmClient {
  private static instance: LlmClient | null = null;
  private modelHandle:
    | {
        provider: "openai";
        model: string;
      }
    | null = null;
  private readonly apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  private readonly baseUrl =
    process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  private readonly model = process.env.LLM_MENU_MODEL?.trim() || DEFAULT_MODEL;
  private readonly timeoutMs = Number(process.env.LLM_MENU_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  private constructor() {}

  static getInstance(): LlmClient {
    if (!LlmClient.instance) {
      LlmClient.instance = new LlmClient();
      logger.info("ai.client.singleton.created", {
        provider: "openai",
        model: LlmClient.instance.model,
      });
    }
    return LlmClient.instance;
  }

  private getModelHandle() {
    if (!this.modelHandle) {
      this.modelHandle = {
        provider: "openai",
        model: this.model,
      };
      logger.info("ai.model.singleton.initialized", {
        provider: this.modelHandle.provider,
        model: this.modelHandle.model,
      });
    }
    return this.modelHandle;
  }

  async suggestMenuItems(payload: RequestPayload): Promise<LlmItemSuggestion[] | null> {
    if (!this.apiKey) {
      logger.warn("ai.model.unavailable.missing_api_key");
      return null;
    }

    const model = this.getModelHandle();
    const prompt = this.buildPrompt(payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    try {
      const content = await this.requestJsonCompletion({
        model: model.model,
        prompt,
        system:
          "You are a menu assistant. Return JSON only: {\"suggestions\":[{\"label\":\"string\",\"confidence\":0.0,\"dietaryTags\":[\"vegetarian\"]}]}.",
        controller,
      });
      if (!content) return null;
      const parsed = JSON.parse(content) as { suggestions?: RawSuggestion[] };
      const normalized = this.normalizeSuggestions(parsed.suggestions ?? [], payload.limit);

      logger.info("ai.model.request.success", {
        model: model.model,
        durationMs: Date.now() - startedAt,
        returned: normalized.length,
      });
      return normalized;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (this.isAbortError(error)) {
        logger.info("ai.model.request.timeout", {
          model: model.model,
          durationMs,
          timeoutMs: this.timeoutMs,
        });
        return null;
      }

      logger.warn("ai.model.request.failed", {
        model: model.model,
        durationMs,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateItemDescription(payload: DescriptionPayload): Promise<string | null> {
    if (!this.apiKey) {
      logger.warn("ai.model.unavailable.missing_api_key");
      return null;
    }

    const model = this.getModelHandle();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    try {
      const content = await this.requestJsonCompletion({
        model: model.model,
        prompt: this.buildDescriptionPrompt(payload),
        system:
          "You are a menu copy assistant. Return JSON only: {\"description\":\"string\"}. Keep it concise and appetizing.",
        controller,
      });
      if (!content) return null;
      const parsed = JSON.parse(content) as { description?: unknown };
      const description =
        typeof parsed.description === "string" ? parsed.description.trim() : "";
      if (!description) return null;
      const normalized = description.slice(0, 300);
      logger.info("ai.model.description.success", {
        model: model.model,
        durationMs: Date.now() - startedAt,
      });
      return normalized;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (this.isAbortError(error)) {
        logger.info("ai.model.description.timeout", {
          model: model.model,
          durationMs,
          timeoutMs: this.timeoutMs,
        });
        return null;
      }
      logger.warn("ai.model.description.failed", {
        model: model.model,
        durationMs,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  private buildPrompt(payload: RequestPayload): string {
    const existing = payload.existingItemNames.length
      ? payload.existingItemNames.join(", ")
      : "none";
    const query = payload.typedQuery?.trim() ? payload.typedQuery.trim() : "none";

    return [
      `Category: ${payload.categoryName}`,
      `Already present items: ${existing}`,
      `Current typed text: ${query}`,
      `Return ${payload.limit} distinct suggestions, excluding already present items.`,
      "If no existing context, return common items for the category.",
      `Dietary tags must be from: ${DIETARY_TAGS.join(", ")}.`,
    ].join("\n");
  }

  private buildDescriptionPrompt(payload: DescriptionPayload): string {
    const tags = payload.dietaryTags?.length ? payload.dietaryTags.join(", ") : "none";
    return [
      `Category: ${payload.categoryName}`,
      `Item: ${payload.itemName}`,
      `Dietary tags: ${tags}`,
      `Tone: ${payload.tone || "neutral"}`,
      "Write a concise menu description in 1-2 short sentences.",
      "Do not include price. Do not use markdown.",
    ].join("\n");
  }

  private async requestJsonCompletion({
    model,
    prompt,
    system,
    controller,
  }: {
    model: string;
    prompt: string;
    system: string;
    controller: AbortController;
  }): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.warn("ai.model.http_error", {
        statusCode: response.status,
        model,
        body: errorBody.slice(0, 300),
      });
      return null;
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return body.choices?.[0]?.message?.content || null;
  }

  private normalizeSuggestions(
    suggestions: RawSuggestion[],
    limit: number
  ): LlmItemSuggestion[] {
    const deduped = new Set<string>();
    const output: LlmItemSuggestion[] = [];

    for (const suggestion of suggestions) {
      if (output.length >= limit) break;
      const label = typeof suggestion.label === "string" ? suggestion.label.trim() : "";
      if (!label) continue;
      const key = label.toLowerCase();
      if (deduped.has(key)) continue;
      deduped.add(key);

      const confidence =
        typeof suggestion.confidence === "number"
          ? Math.min(1, Math.max(0, suggestion.confidence))
          : 0.8;
      const dietaryTags = Array.isArray(suggestion.dietaryTags)
        ? suggestion.dietaryTags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter((tag): tag is DietaryTag => validDietaryTags.has(tag))
        : [];

      output.push({
        label,
        confidence: Number(confidence.toFixed(2)),
        dietaryTags,
      });
    }

    return output;
  }
}

export const getLlmClient = () => LlmClient.getInstance();
