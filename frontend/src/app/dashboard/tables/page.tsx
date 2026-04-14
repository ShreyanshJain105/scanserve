"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch, CSRF_HEADER_NAME, ensureCsrfToken, getApiBase } from "../../../lib/api";
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
    Boolean(selectedBusiness.blocked) ||
    selectedBusiness.status === "pending" ||
    selectedBusiness.status === "rejected" ||
    selectedBusiness.status === "archived";

  const blockedReason = !selectedBusiness
    ? "No business selected. Please select or create a business profile first."
    : selectedBusiness.blocked
      ? "This business is blocked by an admin. Table and QR changes are disabled until it is unblocked."
      : selectedBusiness.status === "pending"
        ? "Table changes are disabled until your selected business is approved."
        : selectedBusiness.status === "rejected"
          ? "This business was rejected. Update details in onboarding to resubmit for approval."
          : selectedBusiness.status === "archived"
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
    const base = getApiBase();
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
        const text = await response.text();
        try {
          const json = JSON.parse(text) as { error?: { message?: string } };
          message = json.error?.message || message;
        } catch {
          message = text.slice(0, 100) || message;
        }
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

        <section className="card-standard p-6">
          <h1 className="text-3xl font-bold text-black tracking-tight">Tables & QR Codes</h1>
          <p className="mt-2 text-sm text-slate-600">
            Create tables, manage labels, and generate QR codes for your menu.
          </p>
        </section>

        {blocked && blockedReason && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
            <span className="font-semibold">Action Required:</span> {blockedReason}
          </div>
        )}

        <section className="card-standard p-6">
          <h2 className="text-lg font-bold text-black">Bulk Creation</h2>
          <form className="mt-4 grid gap-4 items-end md:grid-cols-4" onSubmit={runBulkCreate}>
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Count</span>
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                disabled={blocked || busy}
                onChange={(event) => setCount(Number(event.target.value || 1))}
                className="input-standard"
                placeholder="Count"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Start from</span>
              <input
                type="number"
                min={1}
                value={startFrom}
                disabled={blocked || busy}
                onChange={(event) => setStartFrom(event.target.value)}
                className="input-standard"
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prefix</span>
              <input
                value={labelPrefix}
                disabled={blocked || busy}
                onChange={(event) => setLabelPrefix(event.target.value)}
                className="input-standard"
                placeholder="Prefix"
              />
            </div>
            <button
              type="submit"
              disabled={blocked || busy}
              className="btn-primary h-[42px] w-full"
            >
              {busy ? "Creating..." : "Generate Tables"}
            </button>
          </form>
        </section>

        <section className="card-standard p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-black">Table Management</h2>
              <p className="text-xs text-slate-500 mt-0.5">Edit labels and manage QR codes</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-black focus:ring-black"
                />
                Show Inactive
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
                className="btn-glass text-xs"
              >
                Download All (ZIP)
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            {rows.map((row) => (
              <div key={row.id} className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 p-5 transition-all hover:bg-white hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black text-lg font-bold text-white shadow-sm">
                      {row.tableNumber}
                    </div>
                    <div>
                      <h3 className="font-bold text-black">Table Unit {row.tableNumber}</h3>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">
                        UID: {row.qrCode?.uniqueCode?.slice(0, 10).toUpperCase() || "PENDING"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                        row.isActive ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-700"
                      }`}
                    >
                      {row.isActive ? "Live" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
                  <input
                    value={labelDrafts[row.id] ?? ""}
                    onChange={(event) =>
                      setLabelDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))
                    }
                    className="input-standard max-w-[200px]"
                    placeholder="Custom Label"
                  />
                  <button
                    disabled={blocked || busy}
                    onClick={() => patchTable(row.id, { label: (labelDrafts[row.id] || "").trim() || null })}
                    className="btn-primary text-xs px-4"
                  >
                    Set Label
                  </button>
                  <button
                    disabled={blocked || busy}
                    onClick={() => patchTable(row.id, { isActive: !row.isActive })}
                    className="btn-secondary text-xs px-4"
                  >
                    {row.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <div className="flex-1" />
                  <div className="flex items-center gap-2">
                    <button
                      disabled={blocked || busy}
                      onClick={() => regenerateQr(row.id)}
                      className="btn-glass text-[10px] uppercase tracking-tighter"
                    >
                      Rotate QR
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
                      className="btn-glass text-[10px] uppercase tracking-tighter"
                    >
                      PNG
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
                      className="btn-glass text-[10px] uppercase tracking-tighter"
                    >
                      SVG
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between text-sm text-slate-500 border-t border-slate-100 pt-6">
            <button
              disabled={page <= 1 || busy}
              onClick={() => loadTables(page - 1)}
              className="btn-secondary px-4 py-1.5"
            >
              Previous
            </button>
            <p className="font-medium text-black">
              Page <span className="font-bold">{page}</span> of {pageCount} <span className="mx-2 text-slate-300">|</span> {total} tables
            </p>
            <button
              disabled={page >= pageCount || busy}
              onClick={() => loadTables(page + 1)}
              className="btn-secondary px-4 py-1.5"
            >
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
