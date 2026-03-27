"use client";

import React from "react";
import { DragEvent, FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { showToast } from "../../../lib/toast";
import { apiFetch } from "../../../lib/api";
import { AppHeader } from "../../../components/layout/app-header";
import { BodyBackButton } from "../../../components/layout/body-back-button";

type FormState = {
  name: string;
  currencyCode: string;
  description: string;
  address: string;
  phone: string;
};

const emptyForm: FormState = {
  name: "",
  currencyCode: "USD",
  description: "",
  address: "",
  phone: "",
};

const CURRENCY_OPTIONS = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "DKK",
  "HKD",
  "IDR",
  "JPY",
  "KRW",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "ZAR",
];

const normalizeCurrencyCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);

const toSlugPreview = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64) || "business";

function BusinessOnboardingPageContent() {
  const {
    user,
    loading,
    businesses,
    createBusinessProfile,
    updateBusinessProfile,
    refreshBusinessProfiles,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessId = searchParams.get("businessId");

  const existing = useMemo(
    () => businesses.find((business) => business.id === businessId) ?? null,
    [businesses, businessId]
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const blockedReason = existing?.blocked
    ? "This business is blocked by an admin. You can update details, but it will remain blocked until unblocked."
    : existing?.status === "pending"
      ? "Your business is pending approval. Updates will be reviewed by admin."
      : existing?.status === "rejected"
        ? "This business was rejected. Update details to resubmit for approval."
        : existing?.status === "archived"
          ? "This business is archived. Restore it before making changes."
          : null;
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const currencyInputRef = useRef<HTMLInputElement | null>(null);
  const currencyDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState("");
  const [orgChecked, setOrgChecked] = useState(false);
  const filteredCurrencyOptions = useMemo(() => {
    const normalizedQuery = normalizeCurrencyCode(currencyQuery);
    if (!normalizedQuery) {
      return CURRENCY_OPTIONS;
    }

    return CURRENCY_OPTIONS.filter((code) => code.includes(normalizedQuery));
  }, [currencyQuery]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/home");
      return;
    }

    if (user?.role !== "business") {
      router.push("/dashboard");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user || user.role !== "business") return;
    let cancelled = false;

    const checkOrgMembership = async () => {
      try {
        const data = await apiFetch<{ membership: { id: string } | null }>(
          "/api/business/org/membership",
          { method: "GET" }
        );
        if (!data.membership && !cancelled) {
          router.replace("/dashboard/org/create");
        }
      } catch {
        // If the check fails, allow onboarding to continue to avoid blocking.
      } finally {
        if (!cancelled) {
          setOrgChecked(true);
        }
      }
    };

    void checkOrgMembership();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, user?.role, router]);

  useEffect(() => {
    if (user?.role !== "business") return;
    void refreshBusinessProfiles();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!existing) {
      setForm(emptyForm);
      return;
    }

    setForm({
      name: existing.name,
      currencyCode: existing.currencyCode,
      description: existing.description ?? "",
      address: existing.address,
      phone: existing.phone,
    });
    setLogoPreviewUrl(existing.logoUrl ?? "");
    setLogoFile(null);
  }, [existing]);

  useEffect(() => {
    if (!error) return;
    showToast({ variant: "error", message: error });
  }, [error]);

  useEffect(() => {
    if (!isCurrencyOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!currencyDropdownRef.current?.contains(event.target as Node)) {
        setCurrencyQuery("");
        setIsCurrencyOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCurrencyQuery("");
        setIsCurrencyOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isCurrencyOpen]);

  if (loading || !user || user.role !== "business" || !orgChecked) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader leftMeta="Business onboarding" />
        <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center p-6">
          <p>Loading...</p>
        </section>
      </main>
    );
  }

  const applyLogoFile = (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Unsupported image type. Use PNG, JPEG, or WEBP.");
      return;
    }
    setLogoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreviewUrl(objectUrl);
  };

  const handleLogoDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    applyLogoFile(file);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: form.name,
        currencyCode: form.currencyCode,
        description: form.description || null,
        address: form.address,
        phone: form.phone,
      };

      let businessId: string;
      if (existing) {
        const updated = await updateBusinessProfile({ businessId: existing.id, ...payload });
        businessId = updated.id;
        showToast({ variant: "success", message: "Business profile updated." });
      } else {
        const created = await createBusinessProfile(payload);
        businessId = created.id;
        showToast({ variant: "success", message: "Business profile created." });
      }

      if (logoFile) {
        const formData = new FormData();
        formData.append("logo", logoFile);
        formData.append("businessId", businessId);
        await apiFetch("/api/business/profile/logo", {
          method: "POST",
          body: formData,
        });
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Business onboarding" />
      <section className="mx-auto max-w-2xl p-6">
        <BodyBackButton className="mb-4" />
        {blockedReason && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {blockedReason}
          </div>
        )}
        <div className="rounded-xl border bg-white p-6">
        <h1 className="text-2xl font-semibold">
          {existing ? "Update your business profile" : "Create your business profile"}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Share your business details so we can review and approve your account quickly.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Fields marked required are needed for approval and customer discovery.
        </p>
        {existing?.status === "rejected" && !!existing.rejections?.length && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Recent rejection reasons</p>
            <ul className="mt-1 list-disc pl-4">
              {existing.rejections.slice(0, 3).map((item) => (
                <li key={item.id}>{item.reason || "No reason provided"}</li>
              ))}
            </ul>
          </div>
        )}

        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm">
            <span>Business name</span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className={`rounded-md border px-3 py-2 ${
                existing ? "cursor-not-allowed bg-gray-100 text-gray-600" : ""
              }`}
              placeholder="Example: Green Leaf Cafe"
              disabled={!!existing}
              readOnly={!!existing}
              required
            />
            {existing ? (
              <span className="text-xs text-gray-500">
                Business name is locked after profile creation.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1 text-sm">
            <span>Business URL slug (auto-generated)</span>
            <input
              value={existing?.slug || toSlugPreview(form.name)}
              className="cursor-not-allowed rounded-md border bg-gray-100 px-3 py-2 text-gray-600"
              disabled
              readOnly
            />
            <span className="text-xs text-gray-500">
              Generated from business name and locked to avoid URL conflicts.
            </span>
          </label>

          <div className="grid gap-1 text-sm">
            <label htmlFor="currency-code">Currency code</label>
            <div className="relative" ref={currencyDropdownRef}>
              <input
                ref={currencyInputRef}
                id="currency-code"
                value={isCurrencyOpen ? currencyQuery : form.currencyCode}
                onFocus={() => {
                  setCurrencyQuery("");
                  setIsCurrencyOpen(true);
                }}
                onChange={(event) => {
                  setIsCurrencyOpen(true);
                  setCurrencyQuery(normalizeCurrencyCode(event.target.value));
                }}
                className="w-full rounded-md border px-3 py-2 pr-10"
                placeholder="Search currency code"
                aria-label="Currency code"
                aria-haspopup="listbox"
                aria-expanded={isCurrencyOpen}
                autoComplete="off"
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
                ▾
              </span>
              {isCurrencyOpen ? (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-white p-2 shadow-lg">
                  <div className="max-h-44 overflow-y-auto" role="listbox">
                    {filteredCurrencyOptions.length ? (
                      filteredCurrencyOptions.map((code) => (
                        <button
                          key={code}
                          type="button"
                          className={`block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                            code === form.currencyCode ? "bg-gray-100 font-medium" : ""
                          }`}
                          role="option"
                          aria-selected={code === form.currencyCode}
                          onClick={() => {
                            setForm((current) => ({ ...current, currencyCode: code }));
                            setCurrencyQuery("");
                            setIsCurrencyOpen(false);
                            currencyInputRef.current?.blur();
                          }}
                        >
                          {code}
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-1.5 text-sm text-gray-500">No matching currency codes.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
              <span className="text-xs text-gray-500">
              Type to search. Currency changes only when you select an option.
            </span>
          </div>

          <label className="grid gap-1 text-sm">
            <span>Business address</span>
            <input
              value={form.address}
              onChange={(event) =>
                setForm((current) => ({ ...current, address: event.target.value }))
              }
              className="rounded-md border px-3 py-2"
              placeholder="Street, area, city"
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span>Contact phone</span>
            <input
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
              className="rounded-md border px-3 py-2"
              placeholder="Business support number"
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span>Short description (optional)</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              className="rounded-md border px-3 py-2"
              placeholder="What makes your business special?"
            />
          </label>

          <div className="grid gap-2 text-sm">
            <span>Business logo (optional)</span>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) applyLogoFile(file);
              }}
            />
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleLogoDrop}
              onClick={() => logoInputRef.current?.click()}
              className={`cursor-pointer rounded-md border-2 border-dashed p-4 text-center ${
                dragOver ? "border-black bg-gray-50" : "border-gray-300"
              }`}
            >
              <p className="text-sm text-gray-700">
                Drag and drop logo image here, or click to select
              </p>
              <p className="mt-1 text-xs text-gray-500">PNG, JPEG, WEBP</p>
            </div>
            {logoPreviewUrl ? (
              <div className="mt-1 flex items-center gap-3">
                <img
                  src={logoPreviewUrl}
                  alt="Business logo preview"
                  className="h-16 w-16 rounded-md border object-cover"
                />
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-xs"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreviewUrl(existing?.logoUrl ?? "");
                  }}
                >
                  Remove selection
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-2 flex gap-3">
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? "Saving..." : existing ? "Save profile updates" : "Create profile"}
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2"
              onClick={() => router.push("/dashboard")}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
        </div>
      </section>
    </main>
  );
}

export default function BusinessOnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50">
          <AppHeader leftMeta="Business onboarding" />
          <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center p-6">
            <p>Loading...</p>
          </section>
        </main>
      }
    >
      <BusinessOnboardingPageContent />
    </Suspense>
  );
}
