"use client";

import Link from "next/link";
import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";

type AppHeaderProps = {
  leftMeta?: React.ReactNode;
  rightSlot?: React.ReactNode;
};

export function AppHeader({ leftMeta, rightSlot }: AppHeaderProps) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const roleCta =
    user?.role === "admin"
      ? { href: "/admin", label: "Admin" }
      : user?.role === "business"
        ? { href: "/dashboard", label: "Dashboard" }
        : { href: "/home", label: "Home" };

  const defaultRight = loading ? (
    <p className="text-xs text-slate-500">Loading profile...</p>
  ) : user ? (
    <div className="flex items-center gap-2">
      <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-right">
        <p className="max-w-[200px] truncate text-xs font-medium text-slate-800">{user.email}</p>
        <p className="text-[11px] capitalize text-slate-500">{user.role}</p>
      </div>
      <Link
        href={roleCta.href}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
      >
        {roleCta.label}
      </Link>
      <button
        type="button"
        onClick={() => {
          void logout();
          router.push("/home");
        }}
        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"
      >
        Logout
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
      >
        Login
      </Link>
      <Link
        href="/register/business"
        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"
      >
        Register
      </Link>
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-sm font-semibold text-amber-800">
            S2
          </div>
          <div className="min-w-0">
            <Link href="/home" className="font-semibold tracking-tight text-slate-900">
              Scan2Serve
            </Link>
            <div className="truncate text-xs text-slate-500">
              {leftMeta ?? "Menus, QR and ordering"}
            </div>
          </div>
        </div>
        {rightSlot ?? defaultRight}
      </div>
    </header>
  );
}
