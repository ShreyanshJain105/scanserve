"use client";

export type ToastVariant = "info" | "success" | "error";

export type ToastInput = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

export type ToastRecord = {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastListener = (toast: ToastRecord) => void;

const listeners = new Set<ToastListener>();

export const subscribeToasts = (listener: ToastListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const showToast = ({
  title,
  message,
  variant = "info",
  durationMs = 3600,
}: ToastInput) => {
  const toast: ToastRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    variant,
    durationMs,
  };
  listeners.forEach((listener) => listener(toast));
  return toast.id;
};
