"use client";

import React, { useEffect, useState } from "react";
import type { BusinessNotification } from "@scan2serve/shared";
import { apiFetch } from "../../../lib/api";
import { AppHeader } from "../../../components/layout/app-header";
import { BodyBackButton } from "../../../components/layout/body-back-button";

const formatDistance = (date: Date) => {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<BusinessNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<{ notifications: BusinessNotification[] }>(
          "/api/business/notifications",
          { method: "GET" }
        );
        setNotifications(data.notifications);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader leftMeta="Notifications" />
      <section className="mx-auto max-w-4xl p-6">
        <BodyBackButton className="mb-4" />
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
              <p className="text-sm text-slate-600">Latest updates about your business profile.</p>
            </div>
          </div>

          {loading && <p className="mt-4 text-sm text-slate-600">Loading notifications…</p>}
          {error && (
            <p className="mt-4 text-sm text-rose-600">
              {error}. Refresh or try again later.
            </p>
          )}

          {!loading && !error && notifications.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">No notifications yet.</p>
          )}

          {!loading && !error && notifications.length > 0 && (
            <ul className="mt-4 space-y-3">
              {notifications.map((n) => {
                const payloadText = n.payload ? JSON.stringify(n.payload, null, 2) : null;
                return (
                  <li
                    key={n.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {n.businessName}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">{n.message}</p>
                        <p className="text-xs text-slate-600">Type: {n.type}</p>
                        {payloadText && (
                          <pre className="mt-2 whitespace-pre-wrap rounded bg-white px-3 py-2 text-xs text-slate-700">
                            {payloadText}
                          </pre>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatDistance(new Date(n.createdAt))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
