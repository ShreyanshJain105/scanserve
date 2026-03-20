"use client";

import Link from "next/link";
import { BusinessRegisterForm } from "../../../../components/auth/business-auth-forms";
import { PublicSiteShell } from "../../../../components/public/public-site-shell";
import { ModalDialog } from "../../../../components/ui/modal-dialog";

export default function BusinessRegisterPage() {
  return (
    <PublicSiteShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="font-display text-3xl text-slate-900">Create business account</h1>
        <p className="mt-2 text-sm text-slate-600">
          This route remains available as a fallback page. You can also register from the home
          dialog.
        </p>
        <div className="mt-4">
          <Link href="/home" className="text-sm font-medium text-slate-700 underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </section>

      <ModalDialog open title="Create business account" subtitle="Start with a secure password.">
        <BusinessRegisterForm />
      </ModalDialog>
    </PublicSiteShell>
  );
}
