"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "../../components/layout/app-header";
import { BodyBackButton } from "../../components/layout/body-back-button";

export default function ExplorePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Explore Scan2Serve" />
      <section className="mx-auto max-w-6xl space-y-6 p-6">
        <BodyBackButton />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Explore
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Everything your restaurant needs, connected.
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Scan2Serve ties together orgs, staff access, menu management, QR ordering, and payments.
            Here are the core use cases and how they fit into your workflow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Org & team setup",
              copy:
                "Create an org, invite managers and staff, and grant access to specific businesses.",
            },
            {
              title: "Menu management",
              copy: "Build categories, items, pricing, and images with full control.",
            },
            {
              title: "QR tables",
              copy: "Generate table QR codes, rotate tokens, and manage active seating.",
            },
            {
              title: "Ordering & payments",
              copy: "Accept orders via QR, confirm payments, and move orders through the kitchen.",
            },
            {
              title: "Staff workflows",
              copy: "Managers handle menus and tables while staff focus on order status updates.",
            },
            {
              title: "Owner oversight",
              copy: "Owners control business settings, archiving, and team membership.",
            },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{card.copy}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => router.push("/dashboard/org/create")}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Create org
          </button>
          <button
            onClick={() => router.push("/home")}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700"
          >
            Back to home
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700"
          >
            Back to dashboard
          </button>
        </div>
      </section>
    </main>
  );
}
