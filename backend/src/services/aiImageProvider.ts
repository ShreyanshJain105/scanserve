import { logger } from "../utils/logger";

type GenerateImageInput = {
  prompt: string;
  itemName: string;
  categoryName: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: unknown;
          data?: unknown;
        };
      }>;
    };
  }>;
};

const isAllowedMime = (value: string) =>
  value === "image/jpeg" || value === "image/png" || value === "image/webp";

const inferMimeType = (input?: string | null): string => {
  const lower = (input || "").toLowerCase();
  if (lower.includes("image/png")) return "image/png";
  if (lower.includes("image/webp")) return "image/webp";
  return "image/jpeg";
};

const getTimeoutMs = () => Number(process.env.AI_IMAGE_TIMEOUT_MS || 12000);

const generateWithGemini = async (
  input: GenerateImageInput,
  timeoutMs: number
): Promise<{ buffer: Buffer; mimeType: string } | null> => {
  const provider = "gemini";
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const geminiApiUrl =
    (process.env.GEMINI_API_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const geminiImageModel = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3-pro-image-preview";

  if (!geminiApiKey || !geminiImageModel) {
    logger.warn("ai.image.provider.unavailable", {
      provider,
      hasApiKey: Boolean(geminiApiKey),
      hasModel: Boolean(geminiImageModel),
    });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `${geminiApiUrl}/models/${encodeURIComponent(
    geminiImageModel
  )}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${input.prompt}\n\nItem: ${input.itemName}\nCategory: ${input.categoryName}\nReturn only an image.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn("ai.image.provider.http_error", {
        provider,
        statusCode: response.status,
        body: text.slice(0, 300),
      });
      return null;
    }

    const json = (await response.json()) as GeminiResponse;
    const part = json.candidates?.[0]?.content?.parts?.find(
      (entry) => typeof entry?.inlineData?.data === "string"
    );
    const data = part?.inlineData?.data;
    const mimeType = inferMimeType(
      typeof part?.inlineData?.mimeType === "string" ? part.inlineData.mimeType : null
    );
    if (typeof data !== "string" || !data.trim()) {
      logger.warn("ai.image.provider.empty_response", { provider });
      return null;
    }
    if (!isAllowedMime(mimeType)) {
      logger.warn("ai.image.provider.invalid_mime", { provider, mimeType });
      return null;
    }
    return { buffer: Buffer.from(data, "base64"), mimeType };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.info("ai.image.provider.timeout", { provider, timeoutMs });
      return null;
    }
    logger.warn("ai.image.provider.failed", {
      provider,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const generateMenuItemImage = async (
  input: GenerateImageInput
): Promise<{ buffer: Buffer; mimeType: string } | null> => {
  const timeoutMs = getTimeoutMs();
  return generateWithGemini(input, timeoutMs);
};
