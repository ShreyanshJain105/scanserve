"use client";

import React from "react";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { PublicSiteShell } from "../../components/public/public-site-shell";

const FEATURES = [
  { icon: "🍽️", label: "Digital Menus" },
  { icon: "📱", label: "QR Ordering" },
  { icon: "👥", label: "Team Access" },
  { icon: "📊", label: "Analytics" },
  { icon: "🤖", label: "AI Assistance" },
];

const WHY_ITEMS = [
  {
    icon: "⚡",
    title: "Structured operations",
    body: "Clear sectioned workflows across onboarding, moderation, and menu management.",
  },
  {
    icon: "🚀",
    title: "Ready for growth",
    body: "Add more businesses, manage status transitions, and keep assets under lifecycle control.",
  },
];

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const profileAction = useMemo(() => {
    if (!user) return null;
    if (user.role === "admin") return { label: "Go to admin panel", href: "/admin" };
    if (user.role === "business") return { label: "Open dashboard", href: "/dashboard" };
    return { label: "Stay on home", href: "/home" };
  }, [user]);

  return (
    <PublicSiteShell>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:p-12 animate-fade-up">
        {/* Subtle background gradient blob */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, #fbbf24 0%, transparent 70%)" }}
        />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-700">
            ✦ Built for fast table service
          </span>
          <h1 className="mt-5 text-4xl font-black leading-tight tracking-tighter text-zinc-900 md:text-5xl">
            Beautiful digital menus<br />
            <span className="text-amber-500">with QR-ready ordering</span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-zinc-500">
            Launch branded menus, onboard locations, and control business operations
            from one clean dashboard.
          </p>

          {/* Feature pills */}
          <div className="mt-6 flex flex-wrap gap-2">
            {FEATURES.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-zinc-600"
              >
                {f.icon} {f.label}
              </span>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            {!user && !loading && (
              <>
                <Link
                  href="/register/business"
                  className="btn-primary rounded-xl px-6 py-3 text-sm font-bold"
                >
                  Start free → create your business
                </Link>
                <Link
                  href="/explore"
                  className="btn-secondary rounded-xl px-6 py-3 text-sm"
                >
                  Explore use cases
                </Link>
              </>
            )}
            {user && !loading && (
              <Link
                href="/explore"
                className="btn-secondary rounded-xl px-5 py-2.5 text-sm"
              >
                Explore use cases
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Why section */}
      <section className="mt-6 grid gap-4 md:grid-cols-2 animate-fade-up stagger-1">
        {WHY_ITEMS.map((item) => (
          <article
            key={item.title}
            className="card-standard p-6 hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200"
          >
            <span className="text-2xl">{item.icon}</span>
            <h2 className="mt-3 text-lg font-bold text-zinc-900">{item.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{item.body}</p>
          </article>
        ))}
      </section>

      {/* Profile card — shown when logged in */}
      {user && !loading && (
        <section className="mt-6 card-standard p-6 animate-fade-up stagger-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Signed in as</p>
              <p className="mt-1 text-base font-bold text-zinc-900">{user.email}</p>
              <span className="badge-slate mt-1">{user.role}</span>
            </div>
            {profileAction && (
              <button
                onClick={() => router.push(profileAction.href)}
                className="btn-primary rounded-xl px-5 py-2.5 text-sm shrink-0"
              >
                {profileAction.label}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Customer QR info */}
      <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 animate-fade-up stagger-3">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">ℹ️ Customer access</p>
        <p className="mt-2 text-sm text-zinc-600">
          Customer login is available only from QR/menu flows. Customers are not able to sign up via the main app — they access menus and ordering through table QR codes.
        </p>
      </section>
    </PublicSiteShell>
  );
}
