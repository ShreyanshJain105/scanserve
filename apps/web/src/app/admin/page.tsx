"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessProfile } from "@scan2serve/shared";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { AppHeader } from "../../components/layout/app-header";
import { BodyBackButton } from "../../components/layout/body-back-button";

type AdminBusiness = BusinessProfile & {
  rejections?: { id: string; reason: string | null; createdAt: string }[];
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "archived"
  >(
    "pending"
  );
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/home");
      return;
    }
    if (!loading && user && user.role !== "admin") {
      router.push("/dashboard");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!error) return;
    showToast({ variant: "error", message: error });
  }, [error]);

  const fetchBusinesses = async (filter: typeof statusFilter) => {
    setFetching(true);
    setError(null);
    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      const data = await apiFetch<{ businesses: AdminBusiness[] }>(
        `/api/admin/businesses${query}`,
        { method: "GET" }
      );
      setBusinesses(data.businesses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load businesses");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchBusinesses(statusFilter);
    }
  }, [user, statusFilter]);

  const pendingCount = useMemo(
    () => businesses.filter((business) => business.status === "pending").length,
    [businesses]
  );

  const runModerationAction = async (
    businessId: string,
    action: "approve" | "reject"
  ) => {
    setSubmittingId(businessId);
    setError(null);
    try {
      if (action === "approve") {
        await apiFetch(`/api/admin/businesses/${businessId}/approve`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
        showToast({ variant: "success", message: "Business approved." });
      } else {
        const reason = window.prompt("Optional rejection reason:") ?? "";
        await apiFetch(`/api/admin/businesses/${businessId}/reject`, {
          method: "PATCH",
          body: JSON.stringify({ reason: reason.trim() || null }),
        });
        showToast({ variant: "success", message: "Business rejected." });
      }
      await fetchBusinesses(statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Moderation action failed");
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading || !user || user.role !== "admin") {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader leftMeta="Admin moderation" />
        <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center p-6">
          <p>Loading...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Admin moderation" />
      <section className="mx-auto max-w-6xl space-y-6 p-6">
        <BodyBackButton />
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5">
          <div>
            <h1 className="text-2xl font-semibold">Admin Moderation</h1>
            <p className="text-sm text-gray-600">Pending businesses: {pendingCount}</p>
          </div>
        </header>

        <section className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "rejected", "archived", "all"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`rounded-full px-3 py-1 text-sm capitalize ${
                  statusFilter === value
                    ? "bg-black text-white"
                    : "border border-gray-300 bg-white"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          {fetching ? (
            <p className="mt-4 text-sm text-gray-600">Loading businesses...</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {businesses.map((business) => (
                <article key={business.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{business.name}</h2>
                      <p className="text-sm text-gray-600">{business.slug}</p>
                      <p className="mt-1 text-xs text-gray-500">{business.address}</p>
                    </div>
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs capitalize">
                      {business.status}
                    </span>
                  </div>

                  {!!business.rejections?.length && (
                    <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700">
                      <p className="font-medium">Recent rejection notes</p>
                      <ul className="mt-1 space-y-1">
                        {business.rejections.map((item) => (
                          <li key={item.id}>
                            {item.reason || "No reason provided"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {business.status === "pending" && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => runModerationAction(business.id, "approve")}
                        disabled={submittingId === business.id}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => runModerationAction(business.id, "reject")}
                        disabled={submittingId === business.id}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}

              {businesses.length === 0 && (
                <p className="text-sm text-gray-600">No businesses found for this filter.</p>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
