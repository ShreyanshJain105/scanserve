"use client";

import Link from "next/link";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

type AppHeaderProps = {
  leftMeta?: React.ReactNode;
  rightSlot?: React.ReactNode;
  audience?: "default" | "customer";
};

export function AppHeader({ leftMeta, rightSlot, audience = "default" }: AppHeaderProps) {
  const { user, businessUser, customerUser, loading, logoutBusiness, logoutCustomer, logoutAll } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isTestEnv = process.env.NODE_ENV === "test";
  const headerRef = React.useRef<HTMLElement | null>(null);
  const [resolvedQrToken, setResolvedQrToken] = React.useState<string | null>(null);
  const [notificationCount, setNotificationCount] = React.useState<number | null>(null);
  const [notifications, setNotifications] = React.useState<
    {
      id: string;
      inboxId: string | null;
      businessName: string;
      message: string;
      type: string;
      createdAt: string;
      actorUserId?: string | null;
      payload?: unknown;
    }[]
  >([]);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [loadingNotifications, setLoadingNotifications] = React.useState(false);
  const [notifPage, setNotifPage] = React.useState(1);
  const [notifScope, setNotifScope] = React.useState<"unread" | "all">("unread");
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const notifPageSize = 8;
  const fetchNotifications = React.useCallback(
    async (opts?: { resetPage?: boolean; scope?: "unread" | "all" }) => {
      if (isTestEnv) return;
      const scope = opts?.scope ?? notifScope;
      const endpoint =
        user?.role === "admin"
          ? "/api/admin/notifications"
          : businessUser
            ? "/api/business/notifications"
            : null;
      if (!endpoint) {
        setNotificationCount(null);
        setNotifications([]);
        return;
      }
      setLoadingNotifications(true);
      try {
        const data = await apiFetch<{
          scope: "unread" | "all";
          unreadCount: number;
          notifications: {
            id: string;
            inboxId: string | null;
            businessName: string;
            message: string;
            type: string;
            createdAt: string;
            actorUserId?: string | null;
            payload?: unknown;
          }[];
        }>(`${endpoint}?scope=${scope}`, {
          method: "GET",
        });
        setNotificationCount(data.unreadCount);
        setNotifications(data.notifications);
        if (opts?.resetPage) setNotifPage(1);
        if (scope !== notifScope) setNotifScope(scope);
      } catch {
        setNotificationCount(null);
        setNotifications([]);
      } finally {
        setLoadingNotifications(false);
      }
    },
    [businessUser, isTestEnv, notifScope, user?.role]
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const queryToken = new URLSearchParams(window.location.search).get("token");
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const pathToken =
      pathParts[0] === "qr" && pathParts[1] && !["login", "register"].includes(pathParts[1])
        ? decodeURIComponent(pathParts[1])
        : null;
    const tokenFromUrl = queryToken ?? pathToken;

    if (tokenFromUrl && tokenFromUrl.length >= 12) {
      window.sessionStorage.setItem("last_qr_token", tokenFromUrl);
      setResolvedQrToken(tokenFromUrl);
      return;
    }

    const remembered = window.sessionStorage.getItem("last_qr_token");
    setResolvedQrToken(remembered && remembered.length >= 12 ? remembered : null);
  }, []);

  React.useEffect(() => {
    void fetchNotifications({ resetPage: true });
  }, [fetchNotifications]);

  React.useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!headerRef.current) return;
      if (target && (target as Element).closest("[data-dropdown-root]")) {
        return;
      }
      const openMenus = headerRef.current.querySelectorAll("details[open]");
      openMenus.forEach((menu) => {
        menu.removeAttribute("open");
      });
      setNotificationsOpen(false);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  React.useEffect(() => {
    if (notificationsOpen) {
      void fetchNotifications({ resetPage: true });
    }
  }, [notificationsOpen, fetchNotifications]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const next =
      stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
    }
  };

  const markNotificationRead = async (inboxId: string) => {
    const endpoint =
      user?.role === "admin"
        ? "/api/admin/notifications"
        : businessUser
          ? "/api/business/notifications"
          : null;
    if (!endpoint) return;
    await apiFetch(`${endpoint}/${inboxId}/read`, { method: "POST" });
    setNotifications((prev) => prev.filter((n) => n.inboxId !== inboxId));
    setNotificationCount((prev) => (prev === null ? prev : Math.max(0, prev - 1)));
  };

  const markAllRead = async () => {
    const endpoint =
      user?.role === "admin"
        ? "/api/admin/notifications"
        : businessUser
          ? "/api/business/notifications"
          : null;
    if (!endpoint) return;
    await apiFetch(`${endpoint}/read-all`, { method: "POST" });
    if (notifScope === "unread") {
      setNotifications([]);
    }
    setNotificationCount(0);
  };

  const primaryUser = businessUser ?? user;

  const roleCta =
    primaryUser?.role === "admin"
      ? { href: "/admin", label: "Admin" }
      : primaryUser?.role === "business"
        ? { href: "/dashboard", label: "Dashboard" }
        : { href: "/home", label: "Home" };

  const customerLoginHref = resolvedQrToken
    ? `/qr/login?token=${encodeURIComponent(resolvedQrToken)}`
    : "/home";

  const businessLoginDropdown = (
    <details className="relative" data-dropdown-root>
      <summary className="cursor-pointer list-none rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        Login
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-44 rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <Link
          href="/login"
          className={`block rounded px-2.5 py-2 text-xs ${
            businessUser
              ? "pointer-events-none text-slate-400"
              : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          Login as business
        </Link>
      </div>
    </details>
  );

  const customerLoginDropdown = (
    <details className="relative" data-dropdown-root>
      <summary className="cursor-pointer list-none rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        Login
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-44 rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <Link
          href={customerLoginHref}
          className={`block rounded px-2.5 py-2 text-xs ${
            customerUser
              ? "pointer-events-none text-slate-400"
              : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          Login as customer
        </Link>
      </div>
    </details>
  );

  const showLoginControls = !businessUser && !customerUser;
  const themeToggleButton = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 3a1 1 0 0 1 1 1v1.2a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Z" />
          <path d="M12 18.8a1 1 0 0 1 1 1V21a1 1 0 1 1-2 0v-1.2a1 1 0 0 1 1-1Z" />
          <path d="M4.2 12a1 1 0 0 1 1-1H6.4a1 1 0 1 1 0 2H5.2a1 1 0 0 1-1-1Z" />
          <path d="M17.6 12a1 1 0 0 1 1-1h1.2a1 1 0 1 1 0 2h-1.2a1 1 0 0 1-1-1Z" />
          <path d="M6.7 6.7a1 1 0 0 1 1.4 0l.85.85a1 1 0 0 1-1.41 1.41l-.84-.85a1 1 0 0 1 0-1.41Z" />
          <path d="M15.05 15.05a1 1 0 0 1 1.41 0l.85.84a1 1 0 1 1-1.41 1.41l-.85-.84a1 1 0 0 1 0-1.41Z" />
          <path d="M6.7 17.3a1 1 0 0 1 0-1.41l.84-.84a1 1 0 1 1 1.41 1.41l-.85.84a1 1 0 0 1-1.4 0Z" />
          <path d="M15.05 8.95a1 1 0 0 1 0-1.41l.85-.84a1 1 0 1 1 1.41 1.41l-.84.84a1 1 0 0 1-1.42 0Z" />
          <circle cx="12" cy="12" r="3.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M20.6 14.5a8 8 0 0 1-10.1-10 7 7 0 1 0 10.1 10Z" />
        </svg>
      )}
    </button>
  );

  const customerRight = loading ? (
    <p className="text-xs text-slate-500">Loading session...</p>
  ) : customerUser ? (
    <div className="flex items-center gap-2">
      {themeToggleButton}
      <details className="relative" data-dropdown-root>
        <summary className="cursor-pointer list-none rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100">
          {customerUser.email}
        </summary>
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <Link
            href="/orders"
            className="block rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            View orders
          </Link>
          <button
            type="button"
            onClick={() => {
              void logoutCustomer();
              router.refresh();
            }}
            className="block w-full rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Logout customer
          </button>
        </div>
      </details>
      {customerLoginDropdown}
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {themeToggleButton}
      <div className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        Guest session
      </div>
      {customerLoginDropdown}
    </div>
  );

  const defaultRight = loading ? (
    <p className="text-xs text-slate-500">Loading profile...</p>
  ) : user || businessUser || customerUser ? (
    <div className="flex items-center gap-2">
      {themeToggleButton}
      {businessUser ? (
        <details className="relative" data-dropdown-root>
          <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-3 py-2 text-right text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <span className="max-w-[200px] truncate">{businessUser.email}</span>
        </summary>
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
            Business profile
          </div>
          <button
            type="button"
            onClick={() => {
              void logoutBusiness();
              router.refresh();
            }}
            className="block w-full rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Logout business
          </button>
        </div>
        </details>
      ) : (
        showLoginControls && (
          <Link
            href="/login"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Login as business
          </Link>
        )
      )}
      {customerUser ? (
        <details className="relative" data-dropdown-root>
        <summary className="cursor-pointer list-none rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-right text-xs font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100">
          <span className="max-w-[200px] truncate">{customerUser.email}</span>
        </summary>
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
            Customer profile
          </div>
          <Link
            href="/orders"
            className="block rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            View orders
          </Link>
          <button
            type="button"
            onClick={() => {
              void logoutCustomer();
              router.refresh();
            }}
            className="block w-full rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Logout customer
          </button>
        </div>
        </details>
      ) : null}
      {null}
      {showLoginControls && businessLoginDropdown}
      {(businessUser || user?.role === "admin") && (
        <div className="relative" data-dropdown-root>
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setNotificationsOpen((prev) => !prev)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 3a6 6 0 0 0-6 6v4.2l-1.2 2A.6.6 0 0 0 5.4 16H18.6a.6.6 0 0 0 .52-.8l-1.12-2.1V9a6 6 0 0 0-6-6Z" />
              <path d="M9.75 18.5a2.25 2.25 0 0 0 4.5 0" />
            </svg>
            {notificationCount !== null && notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {notificationCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">Notifications</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] ${
                      notifScope === "unread"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    }`}
                    onClick={() => fetchNotifications({ resetPage: true, scope: "unread" })}
                  >
                    Unread
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] ${
                      notifScope === "all"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    }`}
                    onClick={() => fetchNotifications({ resetPage: true, scope: "all" })}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              {loadingNotifications ? (
                <p className="mt-2 text-[11px] text-slate-600">Loading…</p>
              ) : notifications.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">No notifications yet.</p>
              ) : (
                <>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300">
                    <span>Unread: {notificationCount ?? 0}</span>
                    {notifScope === "unread" && (notificationCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {notifications
                      .slice((notifPage - 1) * notifPageSize, notifPage * notifPageSize)
                      .map((n, idx, list) => {
                        const prev = list[idx - 1];
                        const showBusinessDivider = !prev || prev.businessName !== n.businessName;
                        const payloadEntries =
                          n.payload && typeof n.payload === "object" && !Array.isArray(n.payload)
                            ? Object.entries(n.payload as Record<string, unknown>)
                            : null;
                        const inviteId =
                          n.type === "ORG_INVITE_RECEIVED" &&
                          n.payload &&
                          typeof n.payload === "object" &&
                          !Array.isArray(n.payload) &&
                          "inviteId" in (n.payload as Record<string, unknown>)
                            ? String((n.payload as Record<string, unknown>).inviteId)
                            : null;
                        return (
                          <div key={n.id} className="space-y-1">
                            {showBusinessDivider && (
                              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                                {n.businessName}
                              </p>
                            )}
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                              <div className="flex items-center justify-between">
                                <p className="font-semibold text-slate-900 dark:text-slate-100">{n.message}</p>
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {n.type}
                                </span>
                              </div>
                              {n.actorUserId && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                  Actor: {n.actorUserId.slice(-6)}
                                </p>
                              )}
                              {inviteId && (
                                <Link
                                  href={`/dashboard/org-invite/${inviteId}`}
                                  className="mt-2 inline-flex items-center rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  View org invite
                                </Link>
                              )}
                              {payloadEntries && payloadEntries.length > 0 && (
                                <div className="mt-1 space-y-1 text-[10px] text-slate-600 dark:text-slate-400">
                                  {payloadEntries.map(([key, value]) => (
                                    <div key={key} className="flex items-start gap-1">
                                      <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                        {key}
                                      </span>
                                      <span className="break-all text-slate-700 dark:text-slate-200">
                                        {String(value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                                {new Date(n.createdAt).toLocaleString()}
                              </p>
                              {n.inboxId && (
                                <button
                                  type="button"
                                  className="mt-1 rounded border border-slate-300 px-2 py-1 text-[10px] hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                  onClick={() => markNotificationRead(n.inboxId!)}
                                >
                                  Mark as read
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300">
                    <button
                      type="button"
                      onClick={() => setNotifPage((p) => Math.max(1, p - 1))}
                      disabled={notifPage === 1}
                      className="rounded border px-2 py-1 disabled:opacity-40 dark:border-slate-700"
                    >
                      Prev
                    </button>
                    <span>
                      Page {notifPage} / {Math.max(1, Math.ceil(notifications.length / notifPageSize))}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setNotifPage((p) =>
                          Math.min(Math.max(1, Math.ceil(notifications.length / notifPageSize)), p + 1)
                        )
                      }
                      disabled={notifPage * notifPageSize >= notifications.length}
                      className="rounded border px-2 py-1 disabled:opacity-40 dark:border-slate-700"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {themeToggleButton}
      {businessLoginDropdown}
      <Link
        href="/register/business"
        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
      >
        Register
      </Link>
    </div>
  );

  return (
    <header
      ref={headerRef}
      data-app-header
      className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/90"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-sm font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            S2
          </div>
          <div className="min-w-0">
            <Link href="/home" className="font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Scan2Serve
            </Link>
          </div>
        </div>
        {rightSlot ?? (audience === "customer" ? customerRight : defaultRight)}
      </div>
      <div className="border-t border-slate-200/70 dark:border-slate-800/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-6 py-2">
          <div className="inline-flex rounded-full border border-slate-200 bg-white px-1 py-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {[
              { label: "Home", href: "/home", visible: true },
              { label: "Explore", href: "/explore", visible: true },
              { label: "Dashboard", href: "/dashboard", visible: user?.role === "business" },
            ]
              .filter((item) => item.visible)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    pathname?.startsWith(item.href)
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
          </div>
        </div>
      </div>
    </header>
  );
}
