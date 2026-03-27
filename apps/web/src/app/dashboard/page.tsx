"use client";

import React from "react";
import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { showToast } from "../../lib/toast";
import { AppHeader } from "../../components/layout/app-header";
import { BodyBackButton } from "../../components/layout/body-back-button";
import { ModalDialog } from "../../components/ui/modal-dialog";
import { apiFetch } from "../../lib/api";

const PencilIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path
      d="M13.8 3.2L16.8 6.2L7 16H4V13L13.8 3.2Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export default function DashboardPage() {
  const {
    user,
    loading,
    businesses,
    selectedBusiness,
    selectBusiness,
    businessLoading,
    archiveBusinessProfile,
    restoreBusinessProfile,
  } = useAuth();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "staff">("staff");
  const [inviteExists, setInviteExists] = useState<boolean | null>(null);
  const [inviteChecking, setInviteChecking] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [orgChecked, setOrgChecked] = useState(false);
  const [hasOrg, setHasOrg] = useState(true);
  const [orgRole, setOrgRole] = useState<"owner" | "manager" | "staff" | null>(null);
  const blockedReason = selectedBusiness?.blocked
    ? "This business is blocked by an admin. Dashboard actions are disabled until it is unblocked."
    : selectedBusiness?.status === "pending"
      ? "Dashboard actions are disabled until your selected business is approved."
      : selectedBusiness?.status === "rejected"
        ? "This business was rejected. Update details to resubmit for approval."
        : selectedBusiness?.status === "archived"
          ? "This business is archived. Restore it to access dashboard actions."
          : null;

  useEffect(() => {
    if (!loading && !user) {
      router.push("/home");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user || user.role !== "business") {
      setOrgChecked(true);
      return;
    }

    let cancelled = false;
    const checkOrg = async () => {
      try {
        const data = await apiFetch<{
          membership: { id: string; role: "owner" | "manager" | "staff" } | null;
        }>(
          "/api/business/org/membership",
          { method: "GET" }
        );
        if (!cancelled) {
          setHasOrg(!!data.membership);
          setOrgRole(data.membership?.role ?? null);
        }
      } catch {
        if (!cancelled) {
          setHasOrg(true);
          setOrgRole(null);
        }
      } finally {
        if (!cancelled) {
          setOrgChecked(true);
        }
      }
    };

    void checkOrg();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, user?.role]);

  useEffect(() => {
    if (!loading && orgChecked && user?.role === "business" && !hasOrg) {
      router.replace("/dashboard/org/create");
    }
  }, [loading, orgChecked, user?.role, hasOrg, router]);

  const visibleBusinesses = useMemo(
    () => {
      if (showArchived) {
        return businesses.filter((business) => business.status === "archived");
      }
      return businesses.filter((business) => business.status !== "archived");
    },
    [businesses, showArchived]
  );

  useEffect(() => {
    if (visibleBusinesses.length === 0) {
      return;
    }
    if (selectedBusiness && visibleBusinesses.some((business) => business.id === selectedBusiness.id)) {
      return;
    }
    selectBusiness(visibleBusinesses[0].id);
  }, [visibleBusinesses, selectedBusiness, selectBusiness]);

  if (loading || !orgChecked) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader leftMeta="Business dashboard" />
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
        <AppHeader leftMeta="Business dashboard" />
        <section className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center space-y-4 p-6">
          <h1 className="text-3xl font-semibold">Welcome, {user.email}</h1>
          <p className="text-gray-600">Role: {user.role}</p>
        </section>
      </main>
    );
  }

  if (!hasOrg) {
    return null;
  }

  if (!businessLoading && businesses.length === 0 && orgRole === "owner") {
    router.replace("/dashboard/onboarding");
    return null;
  }

  if (businessLoading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader leftMeta="Business dashboard" />
        <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center p-6">
          <p>Loading business profile...</p>
        </section>
      </main>
    );
  }

  if (businesses.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader leftMeta="Business dashboard" />
        <section className="mx-auto max-w-3xl p-8">
          <h1 className="text-3xl font-semibold">Create your first business</h1>
          <p className="mt-2 text-gray-600">
            Your org is ready. Add your first business to unlock menus, tables, and orders.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => router.push("/dashboard/onboarding")}
              className="rounded-md bg-black px-4 py-2 text-white"
            >
              Create business
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isBlocked =
    selectedBusiness &&
    (selectedBusiness.status === "pending" ||
      selectedBusiness.status === "rejected" ||
      selectedBusiness.status === "archived");
  const statusLabel =
    selectedBusiness?.status === "pending"
      ? "Pending admin approval"
      : selectedBusiness?.status === "rejected"
        ? "Profile rejected - update and resubmit"
        : selectedBusiness?.status === "archived"
          ? "Archived - restore within 30 days"
          : "Approved";
  const showQuickActions = !showArchived && selectedBusiness?.status !== "archived";

  const runArchive = async () => {
    if (!selectedBusiness) return;
    setArchiveSubmitting(true);
    try {
      await archiveBusinessProfile(selectedBusiness.id);
      showToast({
        variant: "success",
        message: "Business archived. It will be permanently deleted after 30 days.",
      });
      setArchiveDialogOpen(false);
      setArchiveConfirmText("");
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to archive business",
      });
    } finally {
      setArchiveSubmitting(false);
    }
  };

  const runRestore = async () => {
    if (!selectedBusiness) return;
    setRestoreSubmitting(true);
    try {
      await restoreBusinessProfile(selectedBusiness.id);
      showToast({ variant: "success", message: "Business restored." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to restore business",
      });
    } finally {
      setRestoreSubmitting(false);
    }
  };

  const checkInviteEmail = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteExists(null);
      return;
    }
    setInviteChecking(true);
    try {
      const data = await apiFetch<{ exists: boolean }>(
        `/api/business/org/invites/check?email=${encodeURIComponent(email)}`,
        { method: "GET" }
      );
      setInviteExists(data.exists);
      if (!data.exists) {
        showToast({ variant: "error", message: "User does not exist." });
      }
    } catch (err) {
      setInviteExists(null);
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to validate user email.",
      });
    } finally {
      setInviteChecking(false);
    }
  };

  const submitInvite = async () => {
    if (inviteSubmitting || inviteChecking) return;
    if (!inviteEmail.trim()) {
      showToast({ variant: "error", message: "Enter a valid email." });
      return;
    }
    if (inviteExists === false) {
      showToast({ variant: "error", message: "User does not exist." });
      return;
    }
    setInviteSubmitting(true);
    try {
      await apiFetch("/api/business/org/invites", {
        method: "POST",
        body: { email: inviteEmail.trim(), role: inviteRole },
      });
      showToast({ variant: "success", message: "Invite sent." });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteExists(null);
      setInviteRole("staff");
    } catch (err) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to send invite.",
      });
    } finally {
      setInviteSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Business dashboard" />
      <section className="mx-auto max-w-6xl space-y-6 p-6">
        <BodyBackButton />
        {blockedReason && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {blockedReason}
          </div>
        )}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5">
          <div>
            <h1 className="text-2xl font-semibold">Business Dashboard</h1>
            <p className="text-sm text-gray-600">Manage businesses, archive state, and operations.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/dashboard/onboarding")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              Add business
            </button>
          </div>
        </header>

        <div
          className={`grid gap-4 ${
            showQuickActions ? "lg:grid-cols-[1fr_320px]" : ""
          }`}
        >
          <section className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Your businesses</p>
              <button
                onClick={() => setShowArchived((current) => !current)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium"
              >
                {showArchived ? "Show active" : "Show archived"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleBusinesses.map((business) => (
                <button
                  key={business.id}
                  onClick={() => selectBusiness(business.id)}
                className={`rounded-lg border p-4 text-left transition ${
                  selectedBusiness?.id === business.id
                    ? business.status === "archived"
                      ? "border-2 border-red-300 bg-red-100"
                        : "border-2 border-orange-300 bg-gray-100"
                    : business.status === "archived"
                      ? "border-red-200 bg-red-50 hover:bg-red-100/70"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
                >
                  <div className="flex items-center gap-3">
                    {business.logoUrl ? (
                      <img
                        src={business.logoUrl}
                        alt={`${business.name} logo`}
                        className="h-12 w-12 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-gray-100 text-xs font-semibold text-gray-600">
                        {business.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{business.name}</p>
                      <p className="truncate text-sm text-gray-600">{business.slug}</p>
                    </div>
                  </div>
                  <span
                    className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs capitalize ${
                      business.status === "archived"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {business.status}
                  </span>
                </button>
              ))}
              {visibleBusinesses.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                  No businesses to show for this view.
                </div>
              )}
            </div>
          </section>
          {showQuickActions && (
            <div className="space-y-3">
              <button
                onClick={() => router.push("/dashboard/menu")}
                className="w-full rounded-xl border border-orange-200 bg-gradient-to-br from-amber-200 via-orange-300 to-rose-300 p-5 text-left shadow-sm transition hover:scale-[1.01] hover:shadow-md"
              >
                <p className="text-2xl font-semibold text-slate-900">Manage menu</p>
                <p className="mt-2 text-sm text-slate-700">
                  Edit categories, prices, availability, and images.
                </p>
              </button>
              <button
                onClick={() => router.push("/dashboard/tables")}
                className="w-full rounded-xl border border-sky-200 bg-gradient-to-br from-sky-100 via-cyan-100 to-teal-100 p-4 text-left shadow-sm transition hover:scale-[1.01] hover:shadow-md"
              >
                <p className="text-xl font-semibold text-slate-900">Manage tables and QR</p>
                <p className="mt-1 text-sm text-slate-700">Create tables, rotate codes, and export downloads.</p>
              </button>
              <button
                onClick={() => setInviteDialogOpen(true)}
                className="w-full rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-100 via-teal-100 to-slate-50 p-4 text-left shadow-sm transition hover:scale-[1.01] hover:shadow-md"
              >
                <p className="text-xl font-semibold text-slate-900">Invite team member</p>
                <p className="mt-1 text-sm text-slate-700">
                  Add managers or staff to your org and businesses.
                </p>
              </button>
              <div className="flex items-start gap-2">
                <button
                  onClick={() => setArchiveDialogOpen(true)}
                  className="rounded-lg border border-red-200 bg-gradient-to-br from-rose-100 via-red-100 to-orange-100 px-4 py-3 text-left shadow-sm transition hover:scale-[1.01] hover:shadow-md"
                >
                  <p className="text-base font-semibold text-red-800">Archive business</p>
                </button>
                <button
                  onClick={() =>
                    selectedBusiness
                      ? router.push(`/dashboard/onboarding?businessId=${selectedBusiness.id}`)
                      : null
                  }
                  aria-label="Edit business details"
                  title="Edit business details"
                  className="rounded-lg border border-slate-300 bg-white p-3 text-slate-800 shadow-sm transition hover:scale-[1.01] hover:shadow-md"
                >
                  <PencilIcon />
                </button>
              </div>
            </div>
          )}
        </div>

        <section
          className={`relative rounded-xl border p-6 ${
            selectedBusiness?.status === "archived"
              ? "border-red-200 bg-red-50"
              : "bg-white"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Active business overview</h2>
            <div className="flex items-center gap-2">
              {selectedBusiness?.status === "archived" ? (
                <button
                  onClick={runRestore}
                  disabled={restoreSubmitting}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {restoreSubmitting ? "Restoring..." : "Restore business"}
                </button>
              ) : null}
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  selectedBusiness?.status === "archived"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {statusLabel}
              </span>
            </div>
          </div>

          <div className={isBlocked ? "pointer-events-none blur-[2px]" : ""}>
            <div className="grid gap-4 md:grid-cols-3">
              <div
                className={`rounded-lg border p-4 ${
                  selectedBusiness?.status === "archived"
                    ? "border-red-200 bg-red-100/60"
                    : ""
                }`}
              >
                <p className="text-sm text-gray-500">Today orders</p>
                <p className="mt-2 text-2xl font-semibold">0</p>
              </div>
              <div
                className={`rounded-lg border p-4 ${
                  selectedBusiness?.status === "archived"
                    ? "border-red-200 bg-red-100/60"
                    : ""
                }`}
              >
                <p className="text-sm text-gray-500">Pending orders</p>
                <p className="mt-2 text-2xl font-semibold">0</p>
              </div>
              <div
                className={`rounded-lg border p-4 ${
                  selectedBusiness?.status === "archived"
                    ? "border-red-200 bg-red-100/60"
                    : ""
                }`}
              >
                <p className="text-sm text-gray-500">Revenue</p>
                <p className="mt-2 text-2xl font-semibold">$0.00</p>
              </div>
            </div>
          </div>

          {isBlocked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 p-6">
              <div className="max-w-md rounded-lg border bg-white p-5 text-center shadow-sm">
                <p className="font-semibold">{statusLabel}</p>
                <p className="mt-2 text-sm text-gray-600">
                  Dashboard operations are disabled until this business is approved.
                </p>
                {selectedBusiness?.status === "archived" && (
                  <p className="mt-2 text-xs text-gray-600">
                    Restore within 30 days to keep this business. After that it is permanently removed.
                  </p>
                )}
                {selectedBusiness?.status === "rejected" &&
                  !!selectedBusiness.rejections?.length && (
                    <div className="mt-3 rounded-md bg-red-50 p-3 text-left text-xs text-red-800">
                      <p className="font-medium">Recent rejection reasons</p>
                      <ul className="mt-1 space-y-1">
                        {selectedBusiness.rejections.slice(0, 3).map((item) => (
                          <li key={item.id}>{item.reason || "No reason provided"}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                {selectedBusiness?.status === "rejected" && (
                  <button
                    onClick={() => router.push(`/dashboard/onboarding?businessId=${selectedBusiness.id}`)}
                    className="mt-4 rounded-md bg-black px-3 py-2 text-sm text-white"
                  >
                    Edit and resubmit
                  </button>
                )}
                {selectedBusiness?.status === "archived" && (
                  <button
                    onClick={runRestore}
                    disabled={restoreSubmitting}
                    className="mt-4 rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {restoreSubmitting ? "Restoring..." : "Restore business"}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
        <ModalDialog
          open={inviteDialogOpen}
          title="Invite to org"
          subtitle="Only existing users can be invited."
          onClose={() => setInviteDialogOpen(false)}
        >
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  setInviteExists(null);
                }}
                onBlur={() => void checkInviteEmail()}
                type="email"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="person@example.com"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Role
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as "manager" | "staff")}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submitInvite}
                disabled={
                  inviteSubmitting ||
                  inviteChecking ||
                  !inviteEmail.trim() ||
                  inviteExists === false
                }
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {inviteSubmitting ? "Sending..." : "Send invite"}
              </button>
              <button
                type="button"
                onClick={() => setInviteDialogOpen(false)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </ModalDialog>
      </section>
      {archiveDialogOpen && selectedBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold">Archive this business?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will disable operations immediately. The business will be permanently deleted
              after 30 days unless restored.
            </p>
            <p className="mt-3 text-xs text-gray-600">
              Type <span className="font-semibold">ARCHIVE</span> to confirm.
            </p>
            <input
              value={archiveConfirmText}
              onChange={(event) => setArchiveConfirmText(event.target.value.toUpperCase())}
              className="mt-2 w-full rounded-md border px-3 py-2"
              placeholder="ARCHIVE"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setArchiveDialogOpen(false);
                  setArchiveConfirmText("");
                }}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={runArchive}
                disabled={archiveConfirmText !== "ARCHIVE" || archiveSubmitting}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {archiveSubmitting ? "Archiving..." : "Confirm archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
