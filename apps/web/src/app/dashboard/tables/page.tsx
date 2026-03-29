"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch, CSRF_HEADER_NAME, ensureCsrfToken } from "../../../lib/api";
import { showToast } from "../../../lib/toast";
import { AppHeader } from "../../../components/layout/app-header";
import { BodyBackButton } from "../../../components/layout/body-back-button";

type TableRow = {
  id: string;
  businessId: string;
  tableNumber: number;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  lastRotatedAt: string | null;
  qrCode: {
    id: string;
    uniqueCode: string;
    createdAt: string;
  } | null;
};

type TableListResponse = {
  tables: TableRow[];
  total: number;
  page: number;
  limit: number;
};

export default function DashboardTablesPage() {
  const { user, loading, selectedBusiness } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<TableRow[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(5);
  const [startFrom, setStartFrom] = useState("");
  const [labelPrefix, setLabelPrefix] = useState("Table");
  const [busy, setBusy] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const blocked =
    !selectedBusiness ||
    selectedBusiness.blocked ||
    selectedBusiness.status === "pending" ||
    selectedBusiness.status === "rejected" ||
    selectedBusiness.status === "archived";
  const blockedReason = selectedBusiness?.blocked
    ? "This business is blocked by an admin. Table and QR changes are disabled until it is unblocked."
    : selectedBusiness?.status === "pending"
      ? "Table changes are disabled until your selected business is approved."
      : selectedBusiness?.status === "rejected"
        ? "This business was rejected. Update details in onboarding to resubmit for approval."
        : selectedBusiness?.status === "archived"
          ? "This business is archived. Restore it before editing tables."
          : null;

  const headers = useMemo(
    () => (selectedBusiness ? { "x-business-id": selectedBusiness.id } : undefined),
    [selectedBusiness]
  );

  const loadTables = async (targetPage = page) => {
    if (!headers) return;
    const params = new URLSearchParams({
      page: String(targetPage),
      limit: String(limit),
      includeInactive: String(includeInactive),
    });
    const data = await apiFetch<TableListResponse>(`/api/business/tables?${params.toString()}`, {
      method: "GET",
      headers,
    });
    setRows(data.tables || []);
    setTotal(data.total || 0);
    setPage(data.page || targetPage);
    setLabelDrafts((prev) => {
      const next = { ...prev };
      for (const row of data.tables || []) {
        next[row.id] = row.label || "";
      }
      return next;
    });
  };

  useEffect(() => {
    if (!loading && !user) router.push("/home");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user?.role === "business" && selectedBusiness?.businessRole === "staff") {
      showToast({
        variant: "error",
        message: "Staff members cannot manage tables. Contact an owner or manager.",
      });
      router.push("/dashboard");
    }
  }, [loading, user?.role, selectedBusiness?.businessRole, router]);

  useEffect(() => {
    if (blocked) return;
    loadTables(1).catch((err) =>
      showToast({ variant: "error", message: err instanceof Error ? err.message : "Failed to load tables" })
    );
  }, [blocked, headers, includeInactive, limit]);

  const runBulkCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!headers || blocked || busy) return;
    setBusy(true);
    try {
      await apiFetch<{ createdCount: number }>("/api/business/tables/bulk", {
        method: "POST",
        headers,
        body: JSON.stringify({
          count,
          startFrom: startFrom.trim() ? Number(startFrom) : undefined,
          labelPrefix: labelPrefix.trim() || undefined,
        }),
      });
      showToast({ variant: "success", message: "Tables created" });
      setStartFrom("");
      await loadTables(1);
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to create tables",
      });
    } finally {
      setBusy(false);
    }
  };

  const patchTable = async (tableId: string, payload: { label?: string | null; isActive?: boolean }) => {
    if (!headers || blocked || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/business/tables/${tableId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      await loadTables(page);
      showToast({ variant: "success", message: "Table updated" });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to update table",
      });
    } finally {
      setBusy(false);
    }
  };

  const regenerateQr = async (tableId: string) => {
    if (!headers || blocked || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/business/tables/${tableId}/qr/regenerate`, {
        method: "POST",
        headers,
      });
      await loadTables(page);
      showToast({ variant: "success", message: "QR regenerated" });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to regenerate QR",
      });
    } finally {
      setBusy(false);
    }
  };

  const downloadBinary = async ({
    endpoint,
    fallbackName,
    method = "GET",
    body,
  }: {
    endpoint: string;
    fallbackName: string;
    method?: "GET" | "POST";
    body?: string;
  }) => {
    if (!headers || blocked) return;
    const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
    const csrfToken = needsCsrf ? await ensureCsrfToken() : null;
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const response = await fetch(`${base}${endpoint}`, {
      method,
      body,
      credentials: "include",
      headers: {
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
      },
    });
    if (!response.ok) {
      let message = "Download failed";
      try {
        const json = (await response.json()) as { error?: { message?: string } };
        message = json.error?.message || message;
      } catch {
        // no-op
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const contentDisposition = response.headers.get("content-disposition");
    const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/i);
    link.href = url;
    link.download = filenameMatch?.[1] || fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const pageCount = Math.max(1, Math.ceil(total / limit));

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return null;
  if (user.role !== "business") {
    return <div className="p-6">Only business users can manage tables.</div>;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <AppHeader />
      <section className="mx-auto mt-4 max-w-6xl space-y-6">
        <BodyBackButton />

        <section className="rounded-xl border bg-white p-5">
          <h1 className="text-2xl font-semibold text-slate-900">Tables and QR</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create tables, edit labels, toggle availability, regenerate and download QR codes.
          </p>
        </section>

        {blocked && blockedReason && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {blockedReason}
          </div>
        )}

        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Bulk Create</h2>
          <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={runBulkCreate}>
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              disabled={blocked || busy}
              onChange={(event) => setCount(Number(event.target.value || 1))}
              className="rounded-md border px-3 py-2"
              placeholder="Count"
            />
            <input
              type="number"
              min={1}
              value={startFrom}
              disabled={blocked || busy}
              onChange={(event) => setStartFrom(event.target.value)}
              className="rounded-md border px-3 py-2"
              placeholder="Start from (optional)"
            />
            <input
              value={labelPrefix}
              disabled={blocked || busy}
              onChange={(event) => setLabelPrefix(event.target.value)}
              className="rounded-md border px-3 py-2"
              placeholder="Label prefix"
            />
            <button
              type="submit"
              disabled={blocked || busy}
              className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {busy ? "Working..." : "Create tables"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Table List</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                />
                Include inactive
              </label>
              <button
                disabled={blocked || busy}
                onClick={() =>
                  downloadBinary({
                    endpoint: "/api/business/tables/qr/download",
                    fallbackName: "tables-qr-png.zip",
                    method: "POST",
                    body: JSON.stringify({ format: "png" }),
                  }).catch((error) =>
                    showToast({
                      variant: "error",
                      message: error instanceof Error ? error.message : "Download failed",
                    })
                  )
                }
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              >
                Download all QR (ZIP)
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-500">Table {row.tableNumber}</p>
                    <p className="text-xs text-gray-500">
                      Token: {row.qrCode?.uniqueCode?.slice(0, 10) || "No QR"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {row.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={labelDrafts[row.id] ?? ""}
                    onChange={(event) =>
                      setLabelDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))
                    }
                    className="w-56 rounded-md border px-3 py-2 text-sm"
                    placeholder="Table label"
                  />
                  <button
                    disabled={blocked || busy}
                    onClick={() => patchTable(row.id, { label: (labelDrafts[row.id] || "").trim() || null })}
                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Save label
                  </button>
                  <button
                    disabled={blocked || busy}
                    onClick={() => patchTable(row.id, { isActive: !row.isActive })}
                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {row.isActive ? "Set inactive" : "Set active"}
                  </button>
                  <button
                    disabled={blocked || busy}
                    onClick={() => regenerateQr(row.id)}
                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Regenerate QR
                  </button>
                  <button
                    disabled={blocked || busy}
                    onClick={() =>
                      downloadBinary({
                        endpoint: `/api/business/tables/${row.id}/qr/download?format=png`,
                        fallbackName: `table-${row.tableNumber}-qr.png`,
                      }).catch((error) =>
                        showToast({
                          variant: "error",
                          message: error instanceof Error ? error.message : "Download failed",
                        })
                      )
                    }
                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    QR PNG
                  </button>
                  <button
                    disabled={blocked || busy}
                    onClick={() =>
                      downloadBinary({
                        endpoint: `/api/business/tables/${row.id}/qr/download?format=svg`,
                        fallbackName: `table-${row.tableNumber}-qr.svg`,
                      }).catch((error) =>
                        showToast({
                          variant: "error",
                          message: error instanceof Error ? error.message : "Download failed",
                        })
                      )
                    }
                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    QR SVG
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <button
              disabled={page <= 1 || busy}
              onClick={() => loadTables(page - 1)}
              className="rounded-md border px-3 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <p>
              Page {page} of {pageCount} ({total} tables)
            </p>
            <button
              disabled={page >= pageCount || busy}
              onClick={() => loadTables(page + 1)}
              className="rounded-md border px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
