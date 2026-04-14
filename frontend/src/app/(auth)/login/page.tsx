"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BusinessLoginForm } from "../../../components/auth/business-auth-forms";
import { PublicSiteShell } from "../../../components/public/public-site-shell";
import { ModalDialog } from "../../../components/ui/modal-dialog";
import { useAuth } from "../../../lib/auth-context";

export default function LoginPage() {
  const { businessUser } = useAuth();
  const router = useRouter();
  const closeDialog = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/home");
  };

  return (
    <PublicSiteShell>
      <ModalDialog
        open
        title="Login"
        subtitle="Access your business or admin workspace."
        onClose={closeDialog}
      >
        {businessUser ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">Already logged in as {businessUser.email}.</p>
            <button
              type="button"
              onClick={() => router.push(businessUser.role === "admin" ? "/admin" : "/dashboard")}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              Continue
            </button>
          </div>
        ) : (
          <BusinessLoginForm />
        )}
      </ModalDialog>
    </PublicSiteShell>
  );
}
