import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BusinessOnboardingPage from "../src/app/dashboard/onboarding/page";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const searchParamsMockState = { value: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/dashboard/onboarding",
  useSearchParams: () => new URLSearchParams(searchParamsMockState.value),
}));

const useAuthMock = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

const apiFetchMock = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
}));

vi.mock("../src/lib/toast", () => ({
  showToast: vi.fn(),
}));

describe("BusinessOnboardingPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    useAuthMock.mockReset();
    apiFetchMock.mockReset();
    searchParamsMockState.value = "";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
    });
  });

  it("shows slug as auto-generated readonly and captures currency", async () => {
    const createBusinessProfileMock = vi.fn(async () => ({ id: "b1" }));
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      businesses: [],
      createBusinessProfile: createBusinessProfileMock,
      updateBusinessProfile: vi.fn(),
      refreshBusinessProfiles: vi.fn(),
    });
    apiFetchMock.mockResolvedValueOnce({
      membership: { id: "m1", orgId: "o1", isOwner: true, orgName: "Org" },
    });

    render(<BusinessOnboardingPage />);

    const slugInput = (await screen.findByDisplayValue("business")) as HTMLInputElement;
    expect(slugInput.disabled).toBe(true);

    fireEvent.change(await screen.findByPlaceholderText("Example: Green Leaf Cafe"), {
      target: { value: "Green Leaf Cafe" },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("green-leaf-cafe")).toBeTruthy();
    });

    const currencyInput = screen.getByLabelText("Currency code");
    fireEvent.focus(currencyInput);
    fireEvent.change(currencyInput, {
      target: { value: "inr" },
    });
    fireEvent.click(screen.getByRole("option", { name: "INR" }));
    expect(screen.queryByRole("option", { name: "INR" })).toBeNull();
    expect(screen.getByLabelText("Currency code")).toHaveValue("INR");

    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "IN" },
    });
    fireEvent.change(screen.getByLabelText("Business timezone"), {
      target: { value: "Asia/Kolkata" },
    });

    fireEvent.change(await screen.findByPlaceholderText("Street, area, city"), {
      target: { value: "12 Main St" },
    });
    fireEvent.change(await screen.findByPlaceholderText("Business support number"), {
      target: { value: "+91-111-111-1111" },
    });
    fireEvent.click(screen.getByText("Create profile"));

    await waitFor(() => {
        expect(createBusinessProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Green Leaf Cafe",
          currencyCode: "INR",
          countryCode: "IN",
          timezone: "Asia/Kolkata",
        })
      );
    });
  });

  it("uploads logo file after profile create", async () => {
    const createBusinessProfileMock = vi.fn(async () => ({ id: "b_logo" }));
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      businesses: [],
      createBusinessProfile: createBusinessProfileMock,
      updateBusinessProfile: vi.fn(),
      refreshBusinessProfiles: vi.fn(),
    });

    apiFetchMock
      .mockResolvedValueOnce({
        membership: { id: "m1", orgId: "o1", isOwner: true, orgName: "Org" },
      })
      .mockResolvedValueOnce({ business: { id: "b_logo" } });

    render(<BusinessOnboardingPage />);

    fireEvent.change(await screen.findByPlaceholderText("Example: Green Leaf Cafe"), {
      target: { value: "Logo Cafe" },
    });
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "US" },
    });
    fireEvent.change(screen.getByLabelText("Business timezone"), {
      target: { value: "America/New_York" },
    });
    fireEvent.change(await screen.findByPlaceholderText("Street, area, city"), {
      target: { value: "12 Main St" },
    });
    fireEvent.change(await screen.findByPlaceholderText("Business support number"), {
      target: { value: "+1-222-222-2222" },
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["logo"], "logo.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Create profile"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/business/profile/logo",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("locks business name and slug when editing existing profile", async () => {
    searchParamsMockState.value = "businessId=b1";
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      businesses: [
        {
          id: "b1",
          userId: "u1",
          name: "Locked Cafe",
          slug: "locked-cafe",
          currencyCode: "USD",
          countryCode: "US",
          timezone: "America/New_York",
          description: "desc",
          logoUrl: null,
          address: "Addr",
          phone: "12345",
          status: "approved",
          createdAt: "",
          updatedAt: "",
          rejections: [],
        },
      ],
      createBusinessProfile: vi.fn(),
      updateBusinessProfile: vi.fn(),
      refreshBusinessProfiles: vi.fn(),
    });
    apiFetchMock.mockResolvedValueOnce({
      membership: { id: "m1", orgId: "o1", isOwner: true, orgName: "Org" },
    });

    render(<BusinessOnboardingPage />);

    const nameInput = (await screen.findByDisplayValue("Locked Cafe")) as HTMLInputElement;
    const slugInput = (await screen.findByDisplayValue("locked-cafe")) as HTMLInputElement;

    expect(nameInput.disabled).toBe(true);
    expect(slugInput.disabled).toBe(true);
    expect(screen.getByText("Business name is locked after profile creation.")).toBeTruthy();
  });

  it("redirects to org create page when no org exists", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "biz@example.com", role: "business" },
      loading: false,
      businesses: [],
      createBusinessProfile: vi.fn(),
      updateBusinessProfile: vi.fn(),
      refreshBusinessProfiles: vi.fn(),
    });
    apiFetchMock.mockImplementation((url: string) => {
      if (url === "/api/business/org/membership") {
        return Promise.resolve({ membership: null });
      }
      return Promise.resolve({});
    });

    render(<BusinessOnboardingPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/org/create");
    });
  });
});
