"use client";

import React from "react";
import { Suspense } from "react";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { showToast } from "../../../lib/toast";
import { PublicSiteShell } from "../../../components/public/public-site-shell";
import { ModalDialog } from "../../../components/ui/modal-dialog";

function QrRegisterContent() {
  const { registerCustomerFromQr, customerUser, error } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("token") ?? "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!error) return;
    showToast({ variant: "error", message: error });
  }, [error]);

  useEffect(() => {
    if (qrToken) return;
    showToast({ variant: "error", message: "Invalid QR registration link." });
    router.replace("/home");
  }, [qrToken, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!qrToken) return;
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      showToast({ variant: "error", message: "Enter email or phone to continue." });
      return;
    }
    const isEmail = trimmedIdentifier.includes("@");
    setLoading(true);
    try {
      await registerCustomerFromQr({
        email: isEmail ? trimmedIdentifier : undefined,
        phone: isEmail ? undefined : trimmedIdentifier,
        password,
        role: "customer",
        qrToken,
      });
      router.push(`/qr/${encodeURIComponent(qrToken)}`);
    } catch {
      // handled in auth context
    } finally {
      setLoading(false);
    }
  };

  const closeDialog = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    if (qrToken) {
      router.push(`/qr/${encodeURIComponent(qrToken)}`);
      return;
    }
    router.push("/home");
  };

  if (!qrToken) return null;

  return (
    <PublicSiteShell headerAudience="customer">
      <ModalDialog
        open
        title="Create QR customer account"
        subtitle="Register and continue in the current table context."
        onClose={closeDialog}
      >
        {customerUser ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">Already logged in as {customerUser.email}.</p>
            <button
              type="button"
              onClick={() => router.push(`/qr/${encodeURIComponent(qrToken)}`)}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Continue
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email or phone</label>
              <input
                type="text"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Email or phone"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-amber-200 transition focus:ring-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-amber-200 transition focus:ring-2"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/qr/login?token=${encodeURIComponent(qrToken)}`}
                className="text-sm font-medium text-slate-700 underline underline-offset-4"
              >
                Already have account?
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {loading ? "Creating..." : "Create account"}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </PublicSiteShell>
  );
}

export default function QrRegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6">
          <p className="text-sm text-slate-600">Loading QR registration...</p>
        </main>
      }
    >
      <QrRegisterContent />
    </Suspense>
  );
}
