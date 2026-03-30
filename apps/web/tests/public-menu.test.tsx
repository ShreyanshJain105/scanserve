import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { PublicMenuClient } from "../src/components/public/public-menu-client";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=valid-qr-token-123"),
}));

vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    customerUser: { id: "c1", email: "cust@example.com", role: "customer" },
  }),
}));

const baseData = {
  business: { id: "b1", name: "Cafe Aurora", slug: "cafe-aurora", currencyCode: "USD" },
  table: { id: "t1", number: 7 },
  categories: [
    {
      id: "c1",
      name: "Coffee",
      sortOrder: 0,
      items: [
        {
          id: "i1",
          name: "Latte",
          description: "Rich espresso with steamed milk",
          price: "5.50",
          dietaryTags: ["vegetarian"],
          imageUrl: null,
          isAvailable: true,
          sortOrder: 0,
        },
        {
          id: "i2",
          name: "Cold Brew",
          description: "Slow steeped, smooth",
          price: "4.25",
          dietaryTags: [],
          imageUrl: null,
          isAvailable: false,
          sortOrder: 1,
        },
      ],
    },
  ],
};

describe("PublicMenuClient", () => {
  beforeEach(() => {
    const memoryStore: Record<string, string> = {};
    (window as any).localStorage = {
      getItem: (key: string) => memoryStore[key] ?? null,
      setItem: (key: string, value: string) => {
        memoryStore[key] = value;
      },
      removeItem: (key: string) => {
        delete memoryStore[key];
      },
      clear: () => {
        Object.keys(memoryStore).forEach((key) => delete memoryStore[key]);
      },
    };
  });

  it("renders categories and items with prices", () => {
    render(<PublicMenuClient data={baseData} cartKey="cart:test" />);

    expect(screen.getByText("Cafe Aurora")).toBeTruthy();
    expect(screen.getByText("Coffee")).toBeTruthy();
    expect(screen.getByText("Latte")).toBeTruthy();
    expect(screen.getByText("$5.50")).toBeTruthy();
    expect(screen.getByText("Cold Brew")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("adds and increments items in the cart", () => {
    render(<PublicMenuClient data={baseData} cartKey="cart:test" />);

    fireEvent.click(screen.getByLabelText("Add Latte"));
    expect(screen.getByText("In cart: 1")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Add Latte"));
    expect(screen.getByText("In cart: 2")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Increase Latte"));
    expect(screen.getByText("In cart: 3")).toBeTruthy();
  });

  it("requires customer name before checkout", () => {
    render(<PublicMenuClient data={baseData} cartKey="cart:test" />);

    fireEvent.click(screen.getByLabelText("Add Latte"));

    const checkoutButton = screen.getByRole("button", { name: "Order & pay" });
    expect(checkoutButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Asha" } });
    expect(checkoutButton).not.toBeDisabled();
  });

  it("resets cart when cartKey changes", () => {
    const { rerender } = render(<PublicMenuClient data={baseData} cartKey="cart:one" />);

    fireEvent.click(screen.getByLabelText("Add Latte"));
    expect(screen.getByText("In cart: 1")).toBeTruthy();

    rerender(<PublicMenuClient data={baseData} cartKey="cart:two" />);
    expect(screen.queryByText("In cart: 1")).toBeNull();
    expect(screen.getAllByText("Add to cart")).toHaveLength(2);
  });

  it("shows descriptions inline on menu rows", () => {
    render(<PublicMenuClient data={baseData} cartKey="cart:test" />);
    expect(screen.getByText("Rich espresso with steamed milk")).toBeTruthy();
  });
});
