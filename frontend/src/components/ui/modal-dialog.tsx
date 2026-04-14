"use client";

import React from "react";

type ModalDialogProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
};

export function ModalDialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidthClass = "max-w-md",
}: ModalDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/35 p-4 backdrop-blur-[1px] md:items-center">
      <div
        className={`max-h-[90vh] w-full overflow-y-auto ${maxWidthClass} rounded-2xl border border-slate-200 bg-white p-6 shadow-xl`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl leading-tight text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          {onClose ? (
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
              aria-label="Close dialog"
            >
              Close
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
