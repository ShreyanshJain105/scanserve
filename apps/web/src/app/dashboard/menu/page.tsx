"use client";

import React from "react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DIETARY_TAGS, type Category, type MenuItem } from "@scan2serve/shared";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { showToast } from "../../../lib/toast";
import { ModalDialog } from "../../../components/ui/modal-dialog";
import { AppHeader } from "../../../components/layout/app-header";
import { BodyBackButton } from "../../../components/layout/body-back-button";

type MenuItemsResponse = {
  items: MenuItem[];
  total: number;
  page: number;
  limit: number;
};

type Suggestion = {
  label: string;
  confidence: number;
  dietaryTags?: string[];
};

type ItemEditDraft = {
  name: string;
  price: string;
  categoryId: string;
  dietaryTag: string;
  description: string;
};

type PendingDeleteTarget = {
  entity: "category" | "item";
  id: string;
  name: string;
};

type IconProps = {
  className?: string;
};

const ChevronUpIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M5 12.5L10 7.5L15 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ChevronDownIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const PencilIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M13.8 3.2L16.8 6.2L7 16H4V13L13.8 3.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const TrashIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M4.5 6H15.5M7.2 6V4.5H12.8V6M6.5 6L7 15.5H13L13.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SparkleIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M10 2.5L11.8 7.1L16.5 8.9L11.8 10.7L10 15.3L8.2 10.7L3.5 8.9L8.2 7.1L10 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const ImageIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <rect x="3.5" y="4" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="7.2" cy="8" r="1.2" stroke="currentColor" strokeWidth="1.2" />
    <path d="M4.5 14L8.7 10.2L11.4 12.4L13.3 10.8L15.5 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CATEGORY_CARD_TONES = [
  "border-l-sky-500",
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-violet-500",
  "border-l-rose-500",
];

export default function DashboardMenuPage() {
  const { user, loading, selectedBusiness } = useAuth();
  const router = useRouter();
  const currencyFormatter = useMemo(() => {
    const currency = selectedBusiness?.currencyCode || "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  }, [selectedBusiness?.currencyCode]);

  const currencySymbol = useMemo(() => {
    try {
      const parts = currencyFormatter.formatToParts(0);
      const symbolPart = parts.find((part) => part.type === "currency");
      return symbolPart?.value || "$";
    } catch {
      return "$";
    }
  }, [currencyFormatter]);

  const formatPrice = (value: string | number) => {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(num)) return value.toString();
    return currencyFormatter.format(num);
  };

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemPage, setItemPage] = useState(1);
  const [itemLimit] = useState(10);
  const [itemTotal, setItemTotal] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("0.00");
  const [itemDescription, setItemDescription] = useState("");
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditDraft, setItemEditDraft] = useState<ItemEditDraft | null>(null);
  const [categorySuggestions, setCategorySuggestions] = useState<Suggestion[]>([]);
  const [itemSuggestions, setItemSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingEditDescription, setGeneratingEditDescription] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [generatingImageItemId, setGeneratingImageItemId] = useState<string | null>(null);
  const [uploadTargetItem, setUploadTargetItem] = useState<MenuItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null);
  const suggestionRequestIdRef = useRef(0);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  const blocked =
    !selectedBusiness ||
    selectedBusiness.blocked ||
    selectedBusiness.status === "pending" ||
    selectedBusiness.status === "rejected";
  const blockedReason = selectedBusiness?.blocked
    ? "This business is blocked by an admin. Menu changes are disabled until it is unblocked."
    : selectedBusiness?.status === "pending"
      ? "Menu changes are disabled until your selected business is approved."
      : selectedBusiness?.status === "rejected"
        ? "This business was rejected. Update details in onboarding to resubmit for approval."
        : null;

  const headers = useMemo(
    () =>
      selectedBusiness ? { "x-business-id": selectedBusiness.id } : undefined,
    [selectedBusiness]
  );

  const loadCategories = async () => {
    if (!headers) return [];
    const categoryData = await apiFetch<{ categories: Category[] }>("/api/business/categories", {
      method: "GET",
      headers,
    });
    setCategories(categoryData.categories);
    if (categoryData.categories.length === 0) {
      setSelectedCategoryId("");
      return categoryData.categories;
    }

    if (
      !selectedCategoryId ||
      !categoryData.categories.some((category) => category.id === selectedCategoryId)
    ) {
      setSelectedCategoryId(categoryData.categories[0].id);
    }

    return categoryData.categories;
  };

  const loadCategorySuggestions = async () => {
    if (!headers) return;
    const data = await apiFetch<{ suggestions?: Suggestion[] }>(
      "/api/business/menu-suggestions/categories",
      {
        method: "GET",
        headers,
      }
    );
    setCategorySuggestions(data?.suggestions ?? []);
  };

  const loadItemSuggestions = async ({
    categoryId,
    query,
  }: {
    categoryId?: string;
    query?: string;
  } = {}) => {
    if (!headers || !selectedBusiness) return;
    const targetCategoryId = categoryId || selectedCategoryId || categories[0]?.id;
    if (!targetCategoryId) {
      setItemSuggestions([]);
      return;
    }
    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;
    setItemSuggestions([]);

    const q = query?.trim() || itemName.trim();
    const params = new URLSearchParams({
      businessId: selectedBusiness.id,
      categoryId: targetCategoryId,
      limit: "5",
    });
    if (q) params.set("q", q);

    const data = await apiFetch<{ suggestions?: Suggestion[] }>(
      `/api/ai/menu/item-suggestions?${params.toString()}`,
      {
        method: "GET",
        headers,
      }
    );
    if (suggestionRequestIdRef.current !== requestId) return;
    setItemSuggestions(data?.suggestions ?? []);
  };

  const loadItems = async (page: number, categoryId?: string) => {
    if (!headers) return;
    const activeCategoryId = categoryId ?? selectedCategoryId;
    const params = new URLSearchParams({
      page: String(page),
      limit: String(itemLimit),
    });
    if (activeCategoryId) {
      params.set("categoryId", activeCategoryId);
    }
    const itemData = await apiFetch<MenuItemsResponse>(
      `/api/business/menu-items?${params.toString()}`,
      {
        method: "GET",
        headers,
      }
    );
    setItems(Array.isArray(itemData.items) ? itemData.items : []);
    setItemPage(typeof itemData.page === "number" ? itemData.page : page);
    setItemTotal(typeof itemData.total === "number" ? itemData.total : 0);
  };

  useEffect(() => {
    if (!loading && !user) router.push("/home");
  }, [loading, user, router]);

  useEffect(() => {
    if (!error) return;
    showToast({ variant: "error", message: error });
  }, [error]);

  useEffect(() => {
    if (!blocked) {
      loadCategories()
        .then((loadedCategories) =>
          Promise.all([
            loadItems(1, loadedCategories[0]?.id),
            loadCategorySuggestions(),
          ])
        )
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load menu"));
    }
  }, [blocked, headers, itemLimit]);

  useEffect(() => {
    if (blocked || !selectedCategoryId) return;
    loadItems(1, selectedCategoryId).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load menu page")
    );
  }, [blocked, selectedCategoryId]);

  useEffect(() => {
    if (blocked) return;
    const delayMs = itemName.trim() ? 280 : 0;
    const timer = setTimeout(() => {
      loadItemSuggestions({
        categoryId: selectedCategoryId || categories[0]?.id,
        query: itemName,
      }).catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load item suggestions");
      });
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [blocked, headers, selectedBusiness, selectedCategoryId, categories, itemTotal, itemName]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader leftMeta="Menu management" />
        <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center p-6">
          <p>Loading...</p>
        </section>
      </main>
    );
  }
  if (!user) return null;

  if (user.role !== "business") {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader leftMeta="Menu management" />
        <section className="mx-auto max-w-6xl p-6">Only business users can manage menu.</section>
      </main>
    );
  }

  const hasCategories = categories.length > 0;
  const totalPages = Math.max(1, Math.ceil(itemTotal / itemLimit));
  const filteredItems = items;

  const createCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!headers || !categoryName.trim()) return;
    if (categoryName.trim().length < 2) {
      setError("Category name must be at least 2 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/business/categories", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: categoryName.trim() }),
      });
      setCategoryName("");
      await Promise.all([loadCategories(), loadCategorySuggestions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setBusy(false);
    }
  };

  const createItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!headers || !itemName.trim()) return;
    const targetCategoryId = selectedCategoryId || categories[0]?.id;
    if (!targetCategoryId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/business/menu-items", {
        method: "POST",
        headers,
        body: JSON.stringify({
          categoryId: targetCategoryId,
          name: itemName.trim(),
          description: itemDescription.trim() || null,
          price: itemPrice,
          dietaryTags: itemTags,
        }),
      });
      setItemName("");
      setItemDescription("");
      setItemPrice("0.00");
      setItemTags([]);
      await loadItems(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create menu item");
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    if (!headers) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/business/menu-items/${item.id}/availability`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ isAvailable: !item.isAvailable }),
      });
      await loadItems(itemPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update availability");
    } finally {
      setBusy(false);
    }
  };

  const reorderItem = async (item: MenuItem, direction: -1 | 1) => {
    if (!headers) return;
    const group = filteredItems;
    const index = group.findIndex((entry) => entry.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= group.length) return;

    const next = [...group];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const orders = next.map((entry, idx) => ({ id: entry.id, sortOrder: idx }));
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/business/menu-items/reorder", {
        method: "POST",
        headers,
        body: JSON.stringify({ orders }),
      });
      await loadItems(itemPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder items");
    } finally {
      setBusy(false);
    }
  };

  const reorderCategory = async (category: Category, direction: -1 | 1) => {
    if (!headers) return;
    const index = categories.findIndex((entry) => entry.id === category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;

    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const orders = next.map((entry, idx) => ({ id: entry.id, sortOrder: idx }));
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/business/categories/reorder", {
        method: "POST",
        headers,
        body: JSON.stringify({ orders }),
      });
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder categories");
    } finally {
      setBusy(false);
    }
  };

  const startCategoryEdit = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const saveCategoryEdit = async () => {
    if (!headers || !editingCategoryId || !editingCategoryName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/business/categories/${editingCategoryId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: editingCategoryName.trim() }),
      });
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setBusy(false);
    }
  };

  const requestDeleteCategory = (categoryId: string) => {
    const category = categories.find((entry) => entry.id === categoryId);
    setPendingDelete({
      entity: "category",
      id: categoryId,
      name: category?.name ?? "this category",
    });
  };

  const startItemEdit = (item: MenuItem) => {
    setEditingItemId(item.id);
    setItemEditDraft({
      name: item.name,
      price: item.price,
      categoryId: item.categoryId,
      dietaryTag: item.dietaryTags[0] || "",
      description: item.description || "",
    });
  };

  const saveItemEdit = async () => {
    if (!headers || !editingItemId || !itemEditDraft) return;
    if (!itemEditDraft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/business/menu-items/${editingItemId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: itemEditDraft.name.trim(),
          price: itemEditDraft.price,
          categoryId: itemEditDraft.categoryId,
          dietaryTags: itemEditDraft.dietaryTag ? [itemEditDraft.dietaryTag] : [],
          description: itemEditDraft.description.trim() || null,
        }),
      });
      setEditingItemId(null);
      setItemEditDraft(null);
      await loadItems(itemPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update menu item");
    } finally {
      setBusy(false);
    }
  };

  const requestDeleteItem = (itemId: string) => {
    const item = filteredItems.find((entry) => entry.id === itemId);
    setPendingDelete({
      entity: "item",
      id: itemId,
      name: item?.name ?? "this item",
    });
  };

  const confirmDelete = async () => {
    if (!headers || !pendingDelete) return;
    const target = pendingDelete;
    setBusy(true);
    setError(null);
    try {
      if (target.entity === "category") {
        await apiFetch(`/api/business/categories/${target.id}`, {
          method: "DELETE",
          headers,
        });
        if (selectedCategoryId === target.id) {
          setSelectedCategoryId("");
        }
        await Promise.all([loadCategories(), loadCategorySuggestions()]);
        await loadItems(1);
      } else {
        await apiFetch(`/api/business/menu-items/${target.id}`, {
          method: "DELETE",
          headers,
        });
        const nextPage = items.length === 1 && itemPage > 1 ? itemPage - 1 : itemPage;
        await loadItems(nextPage);
      }
      setPendingDelete(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : target.entity === "category"
            ? "Failed to delete category"
            : "Failed to delete menu item"
      );
    } finally {
      setBusy(false);
    }
  };

  const goToPage = async (nextPage: number) => {
    if (!headers || nextPage < 1 || nextPage > totalPages || nextPage === itemPage) return;
    setBusy(true);
    setError(null);
    try {
      await loadItems(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load menu page");
    } finally {
      setBusy(false);
    }
  };

  const generateDescription = async ({
    itemNameValue,
    categoryIdValue,
    dietaryTagsValue,
  }: {
    itemNameValue: string;
    categoryIdValue: string;
    dietaryTagsValue: string[];
  }) => {
    if (!headers || !selectedBusiness || !itemNameValue.trim()) return null;
    const result = await apiFetch<{ description: string }>("/api/ai/menu/item-description", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: selectedBusiness.id,
        categoryId: categoryIdValue,
        itemName: itemNameValue.trim(),
        dietaryTags: dietaryTagsValue,
      }),
    });
    return result.description;
  };

  const handleGenerateCreateDescription = async () => {
    const targetCategoryId = selectedCategoryId || categories[0]?.id;
    if (!targetCategoryId || !itemName.trim()) return;
    setGeneratingDescription(true);
    setError(null);
    try {
      const description = await generateDescription({
        itemNameValue: itemName,
        categoryIdValue: targetCategoryId,
        dietaryTagsValue: itemTags,
      });
      if (description) setItemDescription(description);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate description");
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleGenerateEditDescription = async () => {
    if (!itemEditDraft || !itemEditDraft.name.trim()) return;
    setGeneratingEditDescription(true);
    setError(null);
    try {
      const description = await generateDescription({
        itemNameValue: itemEditDraft.name,
        categoryIdValue: itemEditDraft.categoryId,
        dietaryTagsValue: itemEditDraft.dietaryTag ? [itemEditDraft.dietaryTag] : [],
      });
      if (description) {
        setItemEditDraft((prev) => (prev ? { ...prev, description } : prev));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate description");
    } finally {
      setGeneratingEditDescription(false);
    }
  };

  const handleUploadImage = (item: MenuItem) => {
    setUploadTargetItem(item);
    imageFileInputRef.current?.click();
  };

  const handleUploadInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!headers || !uploadTargetItem) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingItemId(uploadTargetItem.id);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      await apiFetch(`/api/business/menu-items/${uploadTargetItem.id}/image/upload`, {
        method: "POST",
        headers,
        body: formData,
      });
      await loadItems(itemPage);
      showToast({ variant: "success", message: `Image uploaded for "${uploadTargetItem.name}".` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadTargetItem(null);
      setUploadingItemId(null);
    }
  };

  const handleGenerateAiImage = async (item: MenuItem) => {
    if (!headers) return;
    setGeneratingImageItemId(item.id);
    setError(null);
    try {
      const prompt = item.description
        ? `${item.name}. ${item.description}`
        : `${item.name} plated food photo`;
      await apiFetch(`/api/business/menu-items/${item.id}/image/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt }),
      });
      await loadItems(itemPage);
      showToast({ variant: "success", message: `AI image generated for "${item.name}".` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI image");
    } finally {
      setGeneratingImageItemId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Menu management" />
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleUploadInputChange}
        className="hidden"
      />
      <section className="mx-auto max-w-6xl p-6">
        <BodyBackButton className="mb-4" />
        {blocked && blockedReason && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {blockedReason}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Categories</h2>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <form onSubmit={createCategory} className="flex gap-2">
                <input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="New category"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || blocked}
                  className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Add
                </button>
            </form>
            <div className="mt-2">
              <p className="text-[11px] font-medium text-gray-500">Suggestions</p>
              <div className="mt-1.5 flex min-h-[30px] flex-wrap gap-1.5">
                {categorySuggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => setCategoryName(suggestion.label)}
                    disabled={busy || blocked}
                    className="rounded-full border border-gray-300 px-2 py-1 text-xs"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            {categories.map((category, idx) => (
              <div
                key={category.id}
                className={`rounded-xl border border-slate-200 border-l-4 bg-white p-3 shadow-sm ${
                  CATEGORY_CARD_TONES[idx % CATEGORY_CARD_TONES.length]
                }`}
              >
                {editingCategoryId === category.id ? (
                  <div className="space-y-2">
                    <input
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveCategoryEdit}
                        disabled={busy}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingCategoryId(null);
                          setEditingCategoryName("");
                        }}
                        disabled={busy}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setSelectedCategoryId(category.id);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                        selectedCategoryId === category.id
                          ? "border-slate-400 bg-slate-100 text-slate-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {category.name}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => reorderCategory(category, -1)}
                        disabled={busy || blocked || idx === 0}
                        aria-label={`Move category ${category.name} up`}
                        title={`Move ${category.name} up`}
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        onClick={() => reorderCategory(category, 1)}
                        disabled={busy || blocked || idx === categories.length - 1}
                        aria-label={`Move category ${category.name} down`}
                        title={`Move ${category.name} down`}
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
                      >
                        <ChevronDownIcon />
                      </button>
                      <button
                        onClick={() => startCategoryEdit(category)}
                        disabled={busy || blocked}
                        aria-label={`Rename category ${category.name}`}
                        title={`Rename ${category.name}`}
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        onClick={() => requestDeleteCategory(category.id)}
                        disabled={busy || blocked}
                        aria-label={`Delete category ${category.name}`}
                        title={`Delete ${category.name}`}
                        className="rounded-md border border-red-200 bg-white p-1.5 text-red-600 hover:border-red-400 hover:text-red-700 disabled:opacity-40"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="relative rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Menu Items</h2>
          {blocked && blockedReason && (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
              {blockedReason}
            </p>
          )}
          {!hasCategories && !blocked && (
            <p className="mt-2 rounded-md bg-blue-50 p-2 text-sm text-blue-800">
              Add your first category to unlock menu item management.
            </p>
          )}
          {!hasCategories && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-xl border border-dashed border-gray-300 bg-white/45" />
          )}
          <div
            className={`${
              !hasCategories ? "pointer-events-none select-none blur-[2px] opacity-60" : ""
            }`}
          >
            <form onSubmit={createItem} className="mt-3 grid gap-2 md:grid-cols-4">
            <div>
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Item name"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center rounded-md border bg-white px-2">
              <span className="pr-2 text-sm font-semibold text-slate-700">
                {currencySymbol}
              </span>
              <input
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                placeholder="0.00"
                className="w-full flex-1 border-0 bg-transparent px-1 py-2 text-sm focus:outline-none"
              />
            </div>
            <select
              value={itemTags[0] || ""}
              onChange={(e) => setItemTags(e.target.value ? [e.target.value] : [])}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">No dietary tag</option>
              {DIETARY_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || blocked || !hasCategories}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Add item
            </button>
            <div className="md:col-span-4">
              <p className="text-[11px] font-medium text-gray-500">Suggestions</p>
              <div className="mt-1.5 flex min-h-[30px] flex-wrap gap-1.5">
                {itemSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => {
                      setItemName(suggestion.label);
                      setItemTags(suggestion.dietaryTags?.slice(0, 1) ?? []);
                    }}
                    disabled={busy || blocked || !hasCategories}
                    className="rounded-full border border-gray-300 px-2 py-1 text-xs"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative md:col-span-4">
              <textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Item description"
                className="w-full rounded-md border px-3 py-2 pr-11 text-sm"
                rows={2}
              />
              <button
                type="button"
                onClick={handleGenerateCreateDescription}
                aria-label="Generate description for new item"
                title={generatingDescription ? "Generating description..." : "Generate description"}
                disabled={
                  busy ||
                  blocked ||
                  !hasCategories ||
                  generatingDescription ||
                  itemName.trim().length < 2
                }
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 disabled:opacity-50"
              >
                <SparkleIcon className={generatingDescription ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
              </button>
            </div>
            </form>
            <div className="mt-4 space-y-2">
              {filteredItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {editingItemId === item.id && itemEditDraft ? (
                      <div className="grid w-full gap-2 md:grid-cols-5">
                      <input
                        value={itemEditDraft.name}
                        onChange={(e) =>
                          setItemEditDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                        }
                        className="rounded border px-2 py-1 text-sm"
                      />
                      <div className="flex items-center rounded border bg-white px-2">
                        <span className="pr-2 text-sm font-semibold text-slate-700">
                          {currencySymbol}
                        </span>
                        <input
                          value={itemEditDraft.price}
                          onChange={(e) =>
                            setItemEditDraft((prev) =>
                              prev ? { ...prev, price: e.target.value } : prev
                            )
                          }
                          className="w-full flex-1 border-0 bg-transparent px-1 py-1 text-sm focus:outline-none"
                        />
                      </div>
                      <select
                        value={itemEditDraft.categoryId}
                        onChange={(e) =>
                          setItemEditDraft((prev) =>
                            prev ? { ...prev, categoryId: e.target.value } : prev
                          )
                        }
                        className="rounded border px-2 py-1 text-sm"
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={itemEditDraft.dietaryTag}
                        onChange={(e) =>
                          setItemEditDraft((prev) =>
                            prev ? { ...prev, dietaryTag: e.target.value } : prev
                          )
                        }
                        className="rounded border px-2 py-1 text-sm"
                      >
                        <option value="">No dietary tag</option>
                        {DIETARY_TAGS.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                      <div className="relative md:col-span-4">
                        <textarea
                          value={itemEditDraft.description}
                          onChange={(e) =>
                            setItemEditDraft((prev) =>
                              prev ? { ...prev, description: e.target.value } : prev
                            )
                          }
                          className="w-full rounded border px-2 py-1 pr-10 text-sm"
                          placeholder="Item description"
                          rows={2}
                        />
                        <button
                          type="button"
                          onClick={handleGenerateEditDescription}
                          aria-label={`Generate description for ${itemEditDraft.name}`}
                          title={
                            generatingEditDescription
                              ? "Generating description..."
                              : `Generate description for ${itemEditDraft.name}`
                          }
                          disabled={busy || blocked || generatingEditDescription}
                          className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded border border-indigo-200 bg-indigo-50 text-indigo-700 disabled:opacity-50"
                        >
                          <SparkleIcon
                            className={generatingEditDescription ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"}
                          />
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={saveItemEdit}
                          disabled={busy || blocked}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingItemId(null);
                            setItemEditDraft(null);
                          }}
                          disabled={busy || blocked}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-4">
                        <div className="flex w-[88px] shrink-0 flex-col items-center gap-2">
                          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={`${item.name} preview`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-slate-500">
                                <ImageIcon className="h-5 w-5" />
                                <span className="text-[10px] font-medium">No Image</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleUploadImage(item)}
                              disabled={busy || blocked || uploadingItemId === item.id}
                              aria-label={`Upload image for ${item.name}`}
                              title={`Upload image for ${item.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:border-slate-400 disabled:opacity-40"
                            >
                              <ImageIcon
                                className={
                                  uploadingItemId === item.id ? "h-4 w-4 animate-pulse" : "h-4 w-4"
                                }
                              />
                            </button>
                            <button
                              onClick={() => void handleGenerateAiImage(item)}
                              disabled={busy || blocked || generatingImageItemId === item.id}
                              aria-label={`Generate AI image for ${item.name}`}
                              title={`Generate AI image for ${item.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 disabled:opacity-40"
                            >
                              <SparkleIcon
                                className={
                                  generatingImageItemId === item.id
                                    ? "h-4 w-4 animate-pulse"
                                    : "h-4 w-4"
                                }
                              />
                            </button>
                          </div>
                        </div>
                        <div className="min-w-[170px]">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-gray-600">{formatPrice(item.price)}</p>
                          {item.description && (
                            <p className="mt-1 max-w-xl text-sm text-slate-500">{item.description}</p>
                          )}
                          {!!item.dietaryTags.length && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.dietaryTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => reorderItem(item, -1)}
                          disabled={busy || blocked || idx === 0}
                          aria-label={`Move item ${item.name} up`}
                          title={`Move ${item.name} up`}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
                        >
                          <ChevronUpIcon />
                        </button>
                        <button
                          onClick={() => reorderItem(item, 1)}
                          disabled={busy || blocked || idx === filteredItems.length - 1}
                          aria-label={`Move item ${item.name} down`}
                          title={`Move ${item.name} down`}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
                        >
                          <ChevronDownIcon />
                        </button>
                        <button
                          onClick={() => startItemEdit(item)}
                          disabled={busy || blocked}
                          aria-label={`Edit item ${item.name}`}
                          title={`Edit ${item.name}`}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          onClick={() => requestDeleteItem(item.id)}
                          disabled={busy || blocked}
                          aria-label={`Delete item ${item.name}`}
                          title={`Delete ${item.name}`}
                          className="rounded-md border border-red-200 bg-white p-1.5 text-red-600 hover:border-red-400 hover:text-red-700 disabled:opacity-40"
                        >
                          <TrashIcon />
                        </button>
                        <button
                          onClick={() => toggleAvailability(item)}
                          disabled={busy || blocked}
                          className={`rounded px-2 py-1 text-xs text-white ${
                            item.isAvailable ? "bg-green-600" : "bg-gray-500"
                          }`}
                        >
                          {item.isAvailable ? "Available" : "Unavailable"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!filteredItems.length && (
                <p className="text-sm text-gray-600">
                  {hasCategories ? "No items in selected category." : "No categories yet."}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-xs text-gray-600">
                Page {itemPage} of {totalPages} ({itemTotal} total items)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(itemPage - 1)}
                  disabled={busy || itemPage <= 1}
                  className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => goToPage(itemPage + 1)}
                  disabled={busy || itemPage >= totalPages}
                  className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          </section>
        </div>
      </section>
      <ModalDialog
        open={!!pendingDelete}
        title={pendingDelete?.entity === "category" ? "Delete category?" : "Delete menu item?"}
        subtitle={
          pendingDelete?.entity === "category"
            ? `Delete "${pendingDelete.name}" only if it has no items.`
            : `Delete "${pendingDelete?.name}" permanently.`
        }
        onClose={busy ? undefined : () => setPendingDelete(null)}
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={busy}
            className="rounded-md bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Deleting..." : "Confirm delete"}
          </button>
        </div>
      </ModalDialog>
    </main>
  );
}
