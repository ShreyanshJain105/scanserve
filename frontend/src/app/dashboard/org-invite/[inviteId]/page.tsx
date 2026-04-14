"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { showToast } from "../../../../lib/toast";

export default function OrgInvitePage() {
  const router = useRouter();
  const params = useParams<{ inviteId?: string }>();
  const inviteId = typeof params?.inviteId === "string" ? params.inviteId : "";
  const { user, loading } = useAuth();
  const [busy, setBusy] = React.useState<"accept" | "decline" | null>(null);

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  const handleAction = async (action: "accept" | "decline") => {
    if (busy) return;
    if (!inviteId) {
      showToast({ variant: "error", message: "Invite link is invalid." });
      return;
    }
    setBusy(action);
    try {
      await apiFetch(`/api/business/org/invites/${inviteId}/${action}`, {
        method: "POST",
      });
      showToast({
        variant: "success",
        message: action === "accept" ? "Org invite accepted." : "Org invite declined.",
      });
      router.replace("/dashboard");
    } catch (err) {
      showToast({
        variant: "error",
        message:
          err instanceof Error ? err.message : "Something went wrong handling the invite.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16 pt-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Org Invite Preview
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sample Org Overview</h1>
        <p className="mt-2 text-sm text-slate-600">
          This is a static preview to keep org details private until you accept.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-white/60" />
        <div className="relative space-y-4 blur-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-lg font-semibold text-slate-900">Sample Org: Horizon Foods</h2>
            <p className="text-sm text-slate-600">Multi-location restaurant group</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Businesses</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>Horizon Cafe — Downtown</li>
              <li>Horizon Grill — Riverside</li>
              <li>Horizon Bakery — Midtown</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Team Highlights</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>12 active team members</li>
              <li>Daily order volume: 120+</li>
              <li>Peak service windows: 12–2 PM, 7–9 PM</li>
            </ul>
          </div>
        </div>

        <div className="relative mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Accepting this invite will grant you access to org businesses you are assigned to.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => handleAction("accept")}
          disabled={busy !== null}
          className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy === "accept" ? "Accepting..." : "Accept Invite"}
        </button>
        <button
          type="button"
          onClick={() => handleAction("decline")}
          disabled={busy !== null}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "decline" ? "Declining..." : "Decline Invite"}
        </button>
      </div>
    </div>
  );
}
