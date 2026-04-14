"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "../../components/layout/app-header";
import { BodyBackButton } from "../../components/layout/body-back-button";

const USE_CASES = [
  {
    icon: "🏢",
    title: "Org & team setup",
    copy: "Create an org, invite managers and staff, and grant access to specific businesses.",
    accent: "border-violet-200 bg-violet-50",
    iconBg: "bg-violet-100",
  },
  {
    icon: "🍽️",
    title: "Menu management",
    copy: "Build categories, items, pricing, and images with full control.",
    accent: "border-amber-200 bg-amber-50",
    iconBg: "bg-amber-100",
  },
  {
    icon: "📱",
    title: "QR tables",
    copy: "Generate table QR codes, rotate tokens, and manage active seating.",
    accent: "border-sky-200 bg-sky-50",
    iconBg: "bg-sky-100",
  },
  {
    icon: "💳",
    title: "Ordering & payments",
    copy: "Accept orders via QR, confirm payments, and move orders through the kitchen.",
    accent: "border-emerald-200 bg-emerald-50",
    iconBg: "bg-emerald-100",
  },
  {
    icon: "👷",
    title: "Staff workflows",
    copy: "Managers handle menus and tables while staff focus on order status updates.",
    accent: "border-orange-200 bg-orange-50",
    iconBg: "bg-orange-100",
  },
  {
    icon: "📊",
    title: "Owner oversight",
    copy: "Owners control business settings, archiving, team membership, and analytics.",
    accent: "border-indigo-200 bg-indigo-50",
    iconBg: "bg-indigo-100",
  },
];

export default function ExplorePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader leftMeta="Explore Scan2Serve" />
      <section className="mx-auto max-w-6xl space-y-8 p-6">
        <BodyBackButton />

        {/* Hero */}
        <div className="card-standard p-8 md:p-10 animate-fade-up">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
            Explore
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tighter text-zinc-900 md:text-4xl">
            Everything your restaurant needs,{" "}
            <span className="text-amber-500">connected.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-500">
            Scan2Serve ties together orgs, staff access, menu management, QR ordering, and
            payments. Here are the core use cases and how they fit into your workflow.
          </p>
        </div>

        {/* Use case cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-up stagger-1">
          {USE_CASES.map((card, i) => (
            <article
              key={card.title}
              className={`relative rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${card.accent}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-xl ${card.iconBg}`}>
                {card.icon}
              </span>
              <h3 className="mt-4 text-base font-bold text-zinc-900">{card.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{card.copy}</p>
            </article>
          ))}
        </div>

        {/* CTA strip */}
        <div className="flex flex-wrap items-center gap-3 animate-fade-up stagger-2">
          <button
            onClick={() => router.push("/dashboard/org/create")}
            className="btn-primary rounded-xl px-6 py-3 text-sm font-bold"
          >
            🏢 Create your org
          </button>
          <button
            onClick={() => router.push("/home")}
            className="btn-secondary rounded-xl px-5 py-2.5 text-sm"
          >
            Back to home
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="btn-ghost rounded-xl px-5 py-2.5 text-sm"
          >
            Go to dashboard
          </button>
        </div>
      </section>
    </main>
  );
}
