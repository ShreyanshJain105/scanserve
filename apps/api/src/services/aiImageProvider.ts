import { logger } from "../utils/logger";

type GenerateImageInput = {
  prompt: string;
  itemName: string;
  categoryName: string;
};

type ProviderResponse = {
  imageUrl?: unknown;
  imageBase64?: unknown;
  mimeType?: unknown;
};

const provider = (process.env.AI_IMAGE_PROVIDER || "nano-banana").trim().toLowerCase();
const nanoBananaApiUrl = process.env.NANOBANANA_API_URL?.trim() || "";
const nanoBananaApiKey = process.env.NANOBANANA_API_KEY?.trim() || "";
const nanoBananaModel = process.env.NANOBANANA_MODEL?.trim() || "nano-banana-v1";
const timeoutMs = Number(process.env.AI_IMAGE_TIMEOUT_MS || 12000);

const isAllowedMime = (value: string) =>
  value === "image/jpeg" || value === "image/png" || value === "image/webp";

const inferMimeType = (input?: string | null): string => {
  const lower = (input || "").toLowerCase();
  if (lower.includes("image/png")) return "image/png";
  if (lower.includes("image/webp")) return "image/webp";
  return "image/jpeg";
};

const fetchAsBuffer = async (url: string): Promise<{ buffer: Buffer; mimeType: string } | null> => {
  const response = await fetch(url);
  if (!response.ok) {
    logger.warn("ai.image.fetch.failed", { statusCode: response.status });
    return null;
  }
  const arr = await response.arrayBuffer();
  const mimeType = inferMimeType(response.headers.get("content-type"));
  return { buffer: Buffer.from(arr), mimeType };
};

export const generateMenuItemImage = async (
  input: GenerateImageInput
): Promise<{ buffer: Buffer; mimeType: string } | null> => {
  if (provider !== "nano-banana") {
    logger.warn("ai.image.provider.unsupported", { provider });
    return null;
  }
  if (!nanoBananaApiUrl || !nanoBananaApiKey) {
    logger.warn("ai.image.provider.unavailable", {
      provider,
      hasApiUrl: Boolean(nanoBananaApiUrl),
      hasApiKey: Boolean(nanoBananaApiKey),
    });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(nanoBananaApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nanoBananaApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: nanoBananaModel,
        prompt: input.prompt,
        itemName: input.itemName,
        categoryName: input.categoryName,
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

    const json = (await response.json()) as ProviderResponse;

    if (typeof json.imageBase64 === "string" && json.imageBase64.trim()) {
      const mimeType = inferMimeType(typeof json.mimeType === "string" ? json.mimeType : null);
      if (!isAllowedMime(mimeType)) return null;
      return { buffer: Buffer.from(json.imageBase64, "base64"), mimeType };
    }

    if (typeof json.imageUrl === "string" && json.imageUrl.trim()) {
      return fetchAsBuffer(json.imageUrl);
    }

    logger.warn("ai.image.provider.empty_response", { provider });
    return null;
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
