"use client";

import { Suspense } from "react";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { showToast } from "../../../lib/toast";
import { PublicSiteShell } from "../../../components/public/public-site-shell";
import { ModalDialog } from "../../../components/ui/modal-dialog";

function QrLoginContent() {
  const { loginCustomerFromQr, error } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!error) return;
    showToast({ variant: "error", message: error });
  }, [error]);

  useEffect(() => {
    if (qrToken) return;
    showToast({ variant: "error", message: "Invalid QR login link." });
    router.replace("/home");
  }, [qrToken, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!qrToken) return;
    setLoading(true);
    try {
      await loginCustomerFromQr({ email, password, qrToken });
      router.push(`/qr/${encodeURIComponent(qrToken)}`);
    } catch {
      // handled in auth context
    } finally {
      setLoading(false);
    }
  };

  if (!qrToken) return null;

  return (
    <PublicSiteShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="font-display text-3xl text-slate-900">QR access login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Continue as a QR customer to access this table context.
        </p>
      </section>

      <ModalDialog
        open
        title="QR customer login"
        subtitle="Enter your credentials to continue for this table."
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
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
              href={`/qr/register?token=${encodeURIComponent(qrToken)}`}
              className="text-sm font-medium text-slate-700 underline underline-offset-4"
            >
              Need account?
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
      </ModalDialog>
    </PublicSiteShell>
  );
}

export default function QrLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6">
          <p className="text-sm text-slate-600">Loading QR login...</p>
        </main>
      }
    >
      <QrLoginContent />
    </Suspense>
  );
}
