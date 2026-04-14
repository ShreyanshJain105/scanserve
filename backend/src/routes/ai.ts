import express from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";
import { logger } from "../utils/logger";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireApprovedBusiness } from "../middleware/businessApproval";
import { getMenuItemSuggestions } from "../services/llmMenuSuggestions";
import { getLlmClient } from "../services/llmClient";
import {
  checkGenerationInputSafety,
  checkUnsafeContent,
  sanitizeGeneratedText,
} from "../services/aiGuardrails";

const router: express.Router = express.Router();

const itemSuggestionsQuerySchema = z.object({
  businessId: z.string().min(1),
  categoryId: z.string().min(1),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

const itemDescriptionBodySchema = z.object({
  businessId: z.string().min(1),
  categoryId: z.string().min(1),
  itemName: z.string().min(2).max(120),
  dietaryTags: z.array(z.string()).optional(),
  tone: z.enum(["neutral", "premium", "casual"]).optional(),
});

const buildFallbackDescription = ({
  itemName,
  categoryName,
  dietaryTags,
}: {
  itemName: string;
  categoryName: string;
  dietaryTags: string[];
}) => {
  const tagLine = dietaryTags.length > 0 ? ` ${dietaryTags.join(", ")} friendly.` : "";
  return `${itemName} from our ${categoryName} selection, crafted for balanced flavor and freshness.${tagLine}`.slice(
    0,
    300
  );
};

router.use(requireAuth, requireRole("business"));

router.get(
  "/menu/item-suggestions",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    const parsed = itemSuggestionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    if (req.business!.id !== parsed.data.businessId) {
      sendError(res, "Business mismatch in request", 403, "BUSINESS_SCOPE_MISMATCH");
      return;
    }

    const category = await prisma.category.findFirst({
      where: { id: parsed.data.categoryId, businessId: req.business!.id },
      select: { id: true, name: true },
    });
    if (!category) {
      sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
      return;
    }

    const existingItems = await prisma.menuItem.findMany({
      where: { businessId: req.business!.id, categoryId: category.id },
      select: { name: true },
    });

    const suggestions = await getMenuItemSuggestions({
      categoryName: category.name,
      existingItemNames: existingItems.map((item: { name: string }) => item.name),
      typedQuery: parsed.data.q,
      limit: parsed.data.limit ?? 5,
    });

    sendSuccess(res, { suggestions });
  })
);

router.post(
  "/menu/item-description",
  requireApprovedBusiness,
  asyncHandler(async (req, res) => {
    const parsed = itemDescriptionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message, 400, "VALIDATION_ERROR");
      return;
    }

    if (req.business!.id !== parsed.data.businessId) {
      sendError(res, "Business mismatch in request", 403, "BUSINESS_SCOPE_MISMATCH");
      return;
    }

    const category = await prisma.category.findFirst({
      where: { id: parsed.data.categoryId, businessId: req.business!.id },
      select: { id: true, name: true },
    });
    if (!category) {
      sendError(res, "Category not found", 404, "CATEGORY_NOT_FOUND");
      return;
    }

    const llm = getLlmClient();
    const inputGuard = checkGenerationInputSafety([
      parsed.data.itemName,
      ...(parsed.data.dietaryTags ?? []),
      parsed.data.tone,
    ]);
    if (!inputGuard.safe) {
      logger.warn("ai.guardrail.blocked_input", {
        route: "/api/ai/menu/item-description",
        businessId: req.business!.id,
        category: inputGuard.category,
      });
      sendError(res, "Prompt content is not allowed", 400, "AI_PROMPT_UNSAFE");
      return;
    }

    const description = await llm.generateItemDescription({
      categoryName: category.name,
      itemName: parsed.data.itemName,
      dietaryTags: parsed.data.dietaryTags ?? [],
      tone: parsed.data.tone,
    });

    const normalizedDescription = description ? sanitizeGeneratedText(description, 300) : null;
    const outputUnsafe =
      normalizedDescription && checkUnsafeContent(normalizedDescription).unsafe;

    sendSuccess(res, {
      description:
        normalizedDescription && !outputUnsafe
          ? normalizedDescription
          : buildFallbackDescription({
              itemName: parsed.data.itemName,
              categoryName: category.name,
              dietaryTags: parsed.data.dietaryTags ?? [],
            }),
    });
  })
);

export default router;
