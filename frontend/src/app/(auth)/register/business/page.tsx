"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BusinessRegisterForm } from "../../../../components/auth/business-auth-forms";
import { PublicSiteShell } from "../../../../components/public/public-site-shell";
import { ModalDialog } from "../../../../components/ui/modal-dialog";
import { useAuth } from "../../../../lib/auth-context";

export default function BusinessRegisterPage() {
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
        title="Create business account"
        subtitle="Start with a secure password."
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
          <BusinessRegisterForm />
        )}
      </ModalDialog>
    </PublicSiteShell>
  );
}
