"use client";

import { useEffect, useState } from "react";
import { subscribeToasts, type ToastRecord } from "../../lib/toast";

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  };

  useEffect(() => {
    const updateOffset = () => {
      const header = document.querySelector<HTMLElement>("[data-app-header]");
      const height = header?.offsetHeight ?? 0;
      const offset = Math.max(16, height + 16);
      document.documentElement.style.setProperty("--app-header-offset", `${offset}px`);
    };
    updateOffset();
    window.addEventListener("resize", updateOffset);
    const unsubscribe = subscribeToasts((toast) => {
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((entry) => entry.id !== toast.id));
      }, toast.durationMs);
    });
    return () => {
      window.removeEventListener("resize", updateOffset);
      unsubscribe();
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
      style={{ top: "var(--app-header-offset, 16px)" }}
    >
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`pointer-events-auto rounded-lg border bg-white px-3 py-2 shadow-md ${
            toast.variant === "error"
              ? "border-red-200"
              : toast.variant === "success"
                ? "border-emerald-200"
                : "border-slate-200"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              {toast.title && (
                <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
              )}
              <p
                className={`text-sm ${
                  toast.variant === "error"
                    ? "text-red-700"
                    : toast.variant === "success"
                      ? "text-emerald-700"
                      : "text-slate-700"
                }`}
              >
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
