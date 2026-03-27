"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "../../../../components/layout/app-header";
import { BodyBackButton } from "../../../../components/layout/body-back-button";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch } from "../../../../lib/api";
import { showToast } from "../../../../lib/toast";

export default function OrgCreatePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [orgName, setOrgName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [checkingOrg, setCheckingOrg] = React.useState(true);

  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  React.useEffect(() => {
    if (loading || !user || user.role !== "business") return;
    let cancelled = false;

    const checkMembership = async () => {
      try {
        const data = await apiFetch<{ membership: { id: string } | null }>(
          "/api/business/org/membership",
          { method: "GET" }
        );
        if (data.membership && !cancelled) {
          router.replace("/dashboard");
        }
      } catch {
        // If we cannot check, allow org creation.
      } finally {
        if (!cancelled) {
          setCheckingOrg(false);
        }
      }
    };

    void checkMembership();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, user?.role, router]);

  if (loading || !user || checkingOrg) return null;

  if (user.role !== "business") {
    router.replace("/dashboard");
    return null;
  }

  const submitOrg = async () => {
    if (!orgName.trim() || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch("/api/business/org", {
        method: "POST",
        body: JSON.stringify({ name: orgName.trim() }),
      });
      showToast({ variant: "success", message: "Org created." });
      router.replace("/dashboard");
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Failed to create org.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Create org" />
      <section className="mx-auto max-w-4xl space-y-6 p-6">
        <BodyBackButton />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Create org
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Start your org before adding businesses.
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Orgs keep your teams, permissions, and businesses together. Once you create an org,
            you can add your first business and invite managers or staff.
          </p>
          <label className="mt-6 block text-sm font-medium text-slate-700">
            Org name
            <input
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              placeholder="Example: Horizon Foods"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={submitOrg}
            disabled={!orgName.trim() || submitting}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? "Creating..." : "Create org"}
          </button>
          <button
            onClick={() => router.push("/explore")}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700"
          >
            Back to explore
          </button>
        </div>
      </section>
    </main>
  );
}
