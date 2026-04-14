"use client";

import React from "react";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { PublicSiteShell } from "../../components/public/public-site-shell";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const profileAction = useMemo(() => {
    if (!user) return null;
    if (user.role === "admin") return { label: "Go to admin", href: "/admin" };
    if (user.role === "business") return { label: "Go to dashboard", href: "/dashboard" };
    return { label: "Stay on home", href: "/home" };
  }, [user]);

  return (
    <PublicSiteShell>
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
              <Link
                href="/register/business"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
              >
                Start with business signup
              </Link>
              <Link
                href="/explore"
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Explore use cases
              </Link>
            </div>
          ) : null}
          {user && !loading ? (
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/explore"
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Explore use cases
              </Link>
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
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-3xl text-slate-900">Customer QR access</h2>
        <p className="mt-2 text-sm text-slate-600">
          Customer login/register is available only from QR/menu flows and uses dialog-based auth.
        </p>
      </section>

    </PublicSiteShell>
  );
}
