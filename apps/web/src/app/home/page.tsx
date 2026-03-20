"use client";

import React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { BusinessLoginForm, BusinessRegisterForm } from "../../components/auth/business-auth-forms";
import { PublicSiteShell } from "../../components/public/public-site-shell";
import { ModalDialog } from "../../components/ui/modal-dialog";

type AuthMode = "login" | "register" | null;

export default function HomePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>(null);

  const profileAction = useMemo(() => {
    if (!user) return null;
    if (user.role === "admin") return { label: "Go to admin", href: "/admin" };
    if (user.role === "business") return { label: "Go to dashboard", href: "/dashboard" };
    return { label: "Stay on home", href: "/home" };
  }, [user]);

  const unauthActions = !loading && !user ? (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setAuthMode("login")}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
      >
        Login
      </button>
      <button
        onClick={() => setAuthMode("register")}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
      >
        Register business
      </button>
    </div>
  ) : null;

  return (
    <PublicSiteShell headerRight={unauthActions}>
      <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm md:grid-cols-2 md:p-8">
        <div>
          <p className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Built for fast table service
          </p>
          <h1 className="font-display mt-4 text-4xl leading-tight text-slate-900 md:text-5xl">
            Beautiful digital menus with QR-ready ordering
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600">
            Launch branded menus, onboard locations, and control business operations from one
            clean dashboard.
          </p>
          {!user && !loading ? (
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={() => setAuthMode("register")}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
              >
                Start with business signup
              </button>
              <button
                onClick={() => setAuthMode("login")}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Login
              </button>
            </div>
          ) : null}
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">What you get</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>1. Guided onboarding with slug, currency and logo upload.</li>
            <li>2. AI-assisted menu authoring with image generation hooks.</li>
            <li>3. Archive-safe business lifecycle with retention cleanup.</li>
          </ul>
        </aside>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-3xl text-slate-900">Structured operations</h2>
          <p className="mt-3 text-sm text-slate-600">
            Use clear sectioned workflows across onboarding, moderation, and menu management.
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-3xl text-slate-900">Ready for growth</h2>
          <p className="mt-3 text-sm text-slate-600">
            Add more businesses, manage status transitions, and keep assets under lifecycle control.
          </p>
        </article>
      </section>

      {user && !loading ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-3xl text-slate-900">Profile</h2>
          <p className="mt-1 text-sm text-slate-600">
            Signed in as <span className="font-medium">{user.email}</span> ({user.role})
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {profileAction ? (
              <button
                onClick={() => router.push(profileAction.href)}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
              >
                {profileAction.label}
              </button>
            ) : null}
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              Logout
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-3xl text-slate-900">Customer QR access</h2>
        <p className="mt-2 text-sm text-slate-600">
          Customer login/register is available from QR routes and now follows dialog-style UX.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/qr/login?token=valid-qr-live-token-123456"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
          >
            Preview QR login
          </Link>
          <Link
            href="/qr/register?token=valid-qr-live-token-123456"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
          >
            Preview QR register
          </Link>
        </div>
      </section>

      <ModalDialog
        open={authMode === "login"}
        title="Welcome back"
        subtitle="Login to continue with your business account."
        onClose={() => setAuthMode(null)}
      >
        <BusinessLoginForm onSuccess={() => setAuthMode(null)} />
      </ModalDialog>

      <ModalDialog
        open={authMode === "register"}
        title="Create business account"
        subtitle="Start with your work email and secure password."
        onClose={() => setAuthMode(null)}
      >
        <BusinessRegisterForm onSuccess={() => setAuthMode(null)} />
      </ModalDialog>
    </PublicSiteShell>
  );
}
