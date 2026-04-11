import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DashboardMenuPage from "../src/app/dashboard/menu/page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/dashboard/menu",
  useSearchParams: () => new URLSearchParams(),
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
}));

describe("DashboardMenuPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useAuthMock.mockReset();
    apiFetchMock.mockReset();
  });

  it("shows role guard for non-business users", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "admin@example.com", role: "admin" },
      loading: false,
      selectedBusiness: null,
    });

    render(<DashboardMenuPage />);
    expect(screen.getByText("Only business users can manage menu.")).toBeTruthy();
  });

  it("loads categories and menu items for approved business", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Starters", sortOrder: 0 }],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({
          items: [],
          total: 0,
          page: 1,
          limit: 10,
        });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({ suggestions: [] });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByText("Categories")).toBeTruthy();
      expect(screen.getByText("Starters")).toBeTruthy();
      expect(screen.getByText("Menu Items")).toBeTruthy();
    });
  });

  it("requests next page when pagination next is clicked", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Starters", sortOrder: 0 }],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({
          items: [],
          total: 25,
          page: 1,
          limit: 10,
        });
      }
      if (path.startsWith("/api/business/menu-items?page=2&limit=10")) {
        return Promise.resolve({
          items: [],
          total: 25,
          page: 2,
          limit: 10,
        });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({ suggestions: [] });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3 (25 total items)")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/menu-items?page=2&limit=10&categoryId=c1",
        expect.objectContaining({ method: "GET" })
      );
      expect(screen.getByText("Page 2 of 3 (25 total items)")).toBeTruthy();
    });
  });

  it("supports item edit and delete actions", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    let currentItems = [
      {
        id: "i1",
        businessId: "b1",
        categoryId: "c1",
        name: "Burger",
        description: null,
        price: "12.50",
        imagePath: null,
        imageUrl: null,
        dietaryTags: [],
        isAvailable: true,
        sortOrder: 0,
      },
    ];

    apiFetchMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Main", sortOrder: 0 }],
        });
      }
      if (
        path.startsWith("/api/business/menu-items?page=1&limit=10") &&
        options?.method === "GET"
      ) {
        return Promise.resolve({
          items: currentItems,
          total: currentItems.length,
          page: 1,
          limit: 10,
        });
      }
      if (path === "/api/business/menu-items/i1" && options?.method === "PATCH") {
        currentItems = [
          {
            ...currentItems[0],
            name: "Burger XL",
            price: "14.50",
          },
        ];
        return Promise.resolve({ item: { id: "i1" } });
      }
      if (path === "/api/business/menu-items/i1" && options?.method === "DELETE") {
        currentItems = [];
        return Promise.resolve({ deleted: true });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({ suggestions: [] });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByText("Burger")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Edit item Burger"));
    fireEvent.change(screen.getByDisplayValue("Burger"), { target: { value: "Burger XL" } });
    fireEvent.change(screen.getByDisplayValue("12.50"), { target: { value: "14.50" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/menu-items/i1",
        expect.objectContaining({ method: "PATCH" })
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Burger XL")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Delete item Burger XL"));

    await waitFor(() => {
      expect(screen.getByText("Delete menu item?")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Confirm delete"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/menu-items/i1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("keeps actions blocked when selected business is pending", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "pending" },
    });

    render(<DashboardMenuPage />);

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Add item")).toHaveProperty("disabled", true);
  });

  it("locks menu items until first category is created and hides all-categories button", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({ categories: [] });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 10 });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByText("Add your first category to unlock menu item management.")).toBeTruthy();
      expect(screen.queryByText("All categories")).toBeNull();
      expect(screen.getByText("Add item")).toHaveProperty("disabled", true);
    });
  });

  it("shows dietary tags and suggestion click prefills item + tag", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Beverages", sortOrder: 0 }],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({
          items: [
            {
              id: "i1",
              businessId: "b1",
              categoryId: "c1",
              name: "Smoothie",
              description: null,
              price: "9.00",
              imagePath: null,
              imageUrl: null,
              dietaryTags: ["vegetarian"],
              isAvailable: true,
              sortOrder: 0,
            },
          ],
          total: 1,
          page: 1,
          limit: 10,
        });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({
          suggestions: [{ label: "Lemon Iced Tea", confidence: 0.95, dietaryTags: ["vegan"] }],
        });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getAllByText("vegetarian").length).toBeGreaterThan(0);
      expect(screen.getByText("Lemon Iced Tea")).toBeTruthy();
      expect(screen.getByText("No Image")).toBeTruthy();
      expect(screen.getByLabelText("Upload image for Smoothie")).toBeTruthy();
      expect(screen.getByLabelText("Generate AI image for Smoothie")).toBeTruthy();
      expect(screen.queryByText("Upload")).toBeNull();
      expect(screen.queryByText("Generate AI")).toBeNull();
    });

    fireEvent.click(screen.getByText("Lemon Iced Tea"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Lemon Iced Tea")).toBeTruthy();
      expect(screen.getByDisplayValue("vegan")).toBeTruthy();
    });
  });

  it("shows preview image when menu item has imageUrl", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Desserts", sortOrder: 0 }],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({
          items: [
            {
              id: "i1",
              businessId: "b1",
              categoryId: "c1",
              name: "Brownie",
              description: null,
              price: "8.00",
              imagePath: null,
              imageUrl: "https://example.com/brownie.jpg",
              dietaryTags: ["vegetarian"],
              isAvailable: true,
              sortOrder: 0,
            },
          ],
          total: 1,
          page: 1,
          limit: 10,
        });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({ suggestions: [] });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByAltText("Brownie preview")).toBeTruthy();
      expect(screen.queryByText("No Image")).toBeNull();
    });
  });

  it("calls upload and AI generate image endpoints from item actions", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Desserts", sortOrder: 0 }],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({
          items: [
            {
              id: "i1",
              businessId: "b1",
              categoryId: "c1",
              name: "Brownie",
              description: "Dark chocolate brownie",
              price: "8.00",
              imagePath: null,
              imageUrl: null,
              dietaryTags: ["vegetarian"],
              isAvailable: true,
              sortOrder: 0,
            },
          ],
          total: 1,
          page: 1,
          limit: 10,
        });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({ suggestions: [] });
      }
      if (path === "/api/business/menu-items/i1/image/upload" && options?.method === "POST") {
        return Promise.resolve({ item: { id: "i1", imagePath: "business/b1/menu-items/i1/uploaded.jpg" } });
      }
      if (path === "/api/business/menu-items/i1/image/generate" && options?.method === "POST") {
        return Promise.resolve({ item: { id: "i1", imagePath: "business/b1/menu-items/i1/generated.jpg" } });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByText("Brownie")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Upload image for Brownie"));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["abcd"], "brownie.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/menu-items/i1/image/upload",
        expect.objectContaining({ method: "POST" })
      );
    });

    fireEvent.click(screen.getByLabelText("Generate AI image for Brownie"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/menu-items/i1/image/generate",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("generates description for create form using ai endpoint", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Main", sortOrder: 0 }],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 10 });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({ suggestions: [] });
      }
      if (path === "/api/ai/menu/item-description" && options?.method === "POST") {
        return Promise.resolve({
          description: "Tender grilled chicken marinated with house spices.",
        });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Item name")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Item name"), {
      target: { value: "Grilled Chicken" },
    });
    fireEvent.click(screen.getByLabelText("Generate description for new item"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/ai/menu/item-description",
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.getByDisplayValue("Tender grilled chicken marinated with house spices.")).toBeTruthy();
    });
  });

  it("reloads suggestions when category changes", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [
            { id: "c1", businessId: "b1", name: "Beverages", sortOrder: 0 },
            { id: "c2", businessId: "b1", name: "Desserts", sortOrder: 1 },
          ],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 10 });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions") && path.includes("categoryId=c1")) {
        return Promise.resolve({
          suggestions: [{ label: "Mango Smoothie", confidence: 0.92, dietaryTags: ["vegetarian"] }],
        });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions") && path.includes("categoryId=c2")) {
        return Promise.resolve({
          suggestions: [{ label: "Chocolate Brownie", confidence: 0.9, dietaryTags: ["vegetarian"] }],
        });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByText("Mango Smoothie")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Desserts"));

    await waitFor(() => {
      expect(screen.getByText("Chocolate Brownie")).toBeTruthy();
    });
  });

  it("clears suggestions while search request is in-flight", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      selectedBusiness: { id: "b1", status: "approved" },
    });

    let resolveQuery: ((value: { suggestions: Array<{ label: string; confidence: number; dietaryTags: string[] }> }) => void) | null = null;

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/business/categories") {
        return Promise.resolve({
          categories: [{ id: "c1", businessId: "b1", name: "Beverages", sortOrder: 0 }],
        });
      }
      if (path.startsWith("/api/business/menu-items?page=1&limit=10")) {
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 10 });
      }
      if (path === "/api/business/menu-suggestions/categories") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions") && path.includes("q=le")) {
        return new Promise((resolve) => {
          resolveQuery = resolve;
        });
      }
      if (path.startsWith("/api/ai/menu/item-suggestions")) {
        return Promise.resolve({
          suggestions: [{ label: "Lemon Iced Tea", confidence: 0.95, dietaryTags: ["vegan"] }],
        });
      }
      return Promise.resolve({});
    });

    render(<DashboardMenuPage />);

    await waitFor(() => {
      expect(screen.getByText("Lemon Iced Tea")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Item name"), {
      target: { value: "le" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Lemon Iced Tea")).toBeNull();
    });

    resolveQuery?.({
      suggestions: [{ label: "Lemon Tart", confidence: 0.93, dietaryTags: ["vegetarian"] }],
    });

    await waitFor(() => {
      expect(screen.getByText("Lemon Tart")).toBeTruthy();
    });
  });
});
