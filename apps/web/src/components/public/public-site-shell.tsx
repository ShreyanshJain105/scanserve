"use client";

import Link from "next/link";
import React from "react";

type PublicSiteShellProps = {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
};

export function PublicSiteShell({ children, headerRight }: PublicSiteShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f9f3ea_0,_#f7f8fb_42%,_#f3f5fa_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-sm font-semibold text-amber-800">
              S2
            </div>
            <div>
              <Link href="/home" className="font-semibold tracking-tight text-slate-900">
                Scan2Serve
              </Link>
              <p className="text-xs text-slate-500">Menus, QR and ordering</p>
            </div>
          </div>
          {headerRight}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>

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
