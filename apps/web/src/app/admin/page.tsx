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

type BusinessUpdate = {
  id: string;
  status: "pending" | "approved" | "rejected";
  payload: Record<string, unknown>;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

const summarizeChanges = (
  business: AdminBusiness,
  payload: Record<string, unknown>
): { field: string; from: string; to: string }[] => {
  const format = (value: unknown) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return Object.entries(payload).map(([key, value]) => ({
    field: key,
    from: format((business as unknown as Record<string, unknown>)[key]),
    to: format(value),
  }));
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
  const [blockSubmittingId, setBlockSubmittingId] = useState<string | null>(null);
  const [updatesByBusiness, setUpdatesByBusiness] = useState<Record<string, BusinessUpdate[]>>({});
  const [updatesLoading, setUpdatesLoading] = useState<Record<string, boolean>>({});
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

  const loadUpdates = async (businessId: string) => {
    setUpdatesLoading((prev) => ({ ...prev, [businessId]: true }));
    try {
      const data = await apiFetch<{ updates: BusinessUpdate[] }>(
        `/api/admin/businesses/${businessId}/updates`,
        { method: "GET" }
      );
      setUpdatesByBusiness((prev) => ({ ...prev, [businessId]: data.updates }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load updates");
    } finally {
      setUpdatesLoading((prev) => ({ ...prev, [businessId]: false }));
    }
  };

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

  const toggleBlock = async (businessId: string, blocked: boolean) => {
    setBlockSubmittingId(businessId);
    setError(null);
    try {
      await apiFetch(`/api/admin/businesses/${businessId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ blocked }),
      });
      showToast({
        variant: "success",
        message: blocked ? "Business blocked." : "Business unblocked.",
      });
      await fetchBusinesses(statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update block status");
    } finally {
      setBlockSubmittingId(null);
    }
  };

  const moderateUpdate = async (
    businessId: string,
    updateId: string,
    action: "approve" | "reject"
  ) => {
    setSubmittingId(updateId);
    setError(null);
    try {
      if (action === "approve") {
        await apiFetch(`/api/admin/businesses/${businessId}/updates/${updateId}/approve`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
        showToast({ variant: "success", message: "Update approved." });
      } else {
        const reason = window.prompt("Optional rejection note:") ?? "";
        await apiFetch(`/api/admin/businesses/${businessId}/updates/${updateId}/reject`, {
          method: "PATCH",
          body: JSON.stringify({ reason: reason.trim() || null }),
        });
        showToast({ variant: "success", message: "Update rejected." });
      }
      await loadUpdates(businessId);
      await fetchBusinesses(statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update moderation failed");
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
                    <div className="flex items-center gap-2">
                      {business.blocked && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          blocked
                        </span>
                      )}
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs capitalize">
                        {business.status}
                      </span>
                    </div>
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

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => toggleBlock(business.id, !business.blocked)}
                      disabled={blockSubmittingId === business.id}
                      className={`rounded-md px-3 py-1.5 text-sm ${
                        business.blocked
                          ? "border border-green-600 text-green-700"
                          : "border border-red-600 text-red-700"
                      } disabled:opacity-50`}
                    >
                      {business.blocked ? "Unblock business" : "Block business"}
                    </button>
                    <button
                      onClick={() => loadUpdates(business.id)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      View updates
                    </button>
                  </div>

                  {updatesLoading[business.id] && (
                    <p className="mt-2 text-xs text-slate-600">Loading updates…</p>
                  )}
                  {updatesByBusiness[business.id] && updatesByBusiness[business.id].length > 0 && (
                    <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700">Pending updates</p>
                      {updatesByBusiness[business.id].map((update) => (
                        <div
                          key={update.id}
                          className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700"
                        >
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {update.status}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(update.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {summarizeChanges(business, update.payload).map((change) => (
                          <div
                            key={`${update.id}-${change.field}`}
                            className="grid grid-cols-[120px,1fr] items-start gap-3 rounded border border-slate-200 bg-slate-50 p-2"
                          >
                            <span className="text-[11px] font-semibold text-slate-700">
                              {change.field}
                            </span>
                            <div className="space-y-0.5 text-[11px] text-slate-700">
                              <div className="flex items-start gap-1">
                                <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-800">
                                  From
                                </span>
                                <span className="break-all">{change.from}</span>
                              </div>
                              <div className="flex items-start gap-1">
                                <span className="rounded bg-emerald-200 px-1.5 py-0.5 font-semibold text-emerald-800">
                                  To
                                </span>
                                <span className="break-all">{change.to}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <details className="mt-2 text-[11px] text-slate-600">
                        <summary className="cursor-pointer text-slate-700">View raw payload</summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-[11px]">
                          {JSON.stringify(update.payload, null, 2)}
                        </pre>
                      </details>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => moderateUpdate(business.id, update.id, "approve")}
                          disabled={submittingId === update.id}
                          className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => moderateUpdate(business.id, update.id, "reject")}
                              disabled={submittingId === update.id}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
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
