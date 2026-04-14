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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm transition-all duration-300">
      <div
        className={`max-h-[90vh] w-full overflow-y-auto ${maxWidthClass} card-standard border-none p-8 shadow-2xl animate-in fade-in zoom-in duration-200`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-black">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-zinc-600">{subtitle}</p> : null}
          </div>
          {onClose ? (
            <button
              onClick={onClose}
              className="btn-secondary rounded-full p-2 hover:bg-slate-100 transition-colors"
              aria-label="Close dialog"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
