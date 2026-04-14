"use client";

import React from "react";
import { AppHeader } from "../layout/app-header";
import { BodyBackButton } from "../layout/body-back-button";

type PublicSiteShellProps = {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  headerLeftMeta?: React.ReactNode;
  headerAudience?: "default" | "customer";
};

export function PublicSiteShell({
  children,
  headerRight,
  headerLeftMeta,
  headerAudience = "default",
}: PublicSiteShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f9f3ea_0,_#f7f8fb_42%,_#f3f5fa_100%)] text-slate-900">
      <AppHeader leftMeta={headerLeftMeta} rightSlot={headerRight} audience={headerAudience} />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <BodyBackButton className="mb-4" />
        {children}
      </main>

      <footer className="mt-12 border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 sm:grid-cols-3">
          <section>
            <h2 className="text-sm font-semibold text-slate-900">Product</h2>
            <p className="mt-2 text-sm text-slate-600">
              Digital menus, business onboarding, and table-ready QR experiences.
            </p>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-slate-900">Support</h2>
            <p className="mt-2 text-sm text-slate-600">Help center and operational guidance.</p>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-slate-900">Legal</h2>
            <p className="mt-2 text-sm text-slate-600">Terms, privacy, and retention policy.</p>
          </section>
        </div>
      </footer>
    </div>
  );
}
