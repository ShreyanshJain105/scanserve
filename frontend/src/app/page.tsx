import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "../components/layout/app-header";

const DEFAULT_SITE_URL = "http://localhost:3000";
const DEFAULT_APP_URL = "http://app.localhost:3000";

const getConfiguredHost = (value: string | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
};

export default async function RootPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;
  const qrAccessToken = cookieStore.get("qr_customer_access")?.value;
  const qrRefreshToken = cookieStore.get("qr_customer_refresh")?.value;
  const hostHeader = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const host = hostHeader.split(",")[0].trim().toLowerCase();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
  const siteHost = getConfiguredHost(siteUrl);
  const appHost = getConfiguredHost(appUrl);
  const isAppHost = appHost ? host === appHost : false;

  const hasBusinessToken = Boolean(accessToken || refreshToken);
  const hasCustomerToken = Boolean(qrAccessToken || qrRefreshToken);

  if (isAppHost) {
    if (hasBusinessToken) {
      redirect("/dashboard");
    }

    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <AppHeader leftMeta="Scan2Serve App" />
        <section className="mx-auto grid min-h-[75vh] max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-amber-200">
              Operator console
            </div>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              The app built for <span className="text-amber-400">live service.</span>
            </h1>
            <p className="max-w-xl text-lg text-slate-300">
              Stay focused on tables, orders, and performance with a dashboard designed for
              operators — not customers.
            </p>
            <div className="flex flex-wrap gap-4 mt-2">
              <Link
                href="/login"
                className="rounded-xl bg-amber-400 px-8 py-4 text-sm font-bold text-slate-950 shadow-lg shadow-amber-400/20 transition-all hover:bg-amber-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                Sign in to the app
              </Link>
              <Link
                href={siteHost ? new URL("/home", siteUrl).toString() : "/home"}
                className="rounded-xl border border-slate-700 px-8 py-4 text-sm font-bold text-slate-200 transition-all hover:border-slate-500 hover:bg-slate-900 active:scale-[0.98]"
              >
                Visit public site
              </Link>
            </div>
            <div className="mt-4 grid gap-4 text-sm text-slate-300 sm:grid-cols-3">
              <div className="card-premium p-5 border-slate-800 bg-slate-900/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Orders</p>
                <p className="mt-2 text-base font-bold text-white">Live status control</p>
              </div>
              <div className="card-premium p-5 border-slate-800 bg-slate-900/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Operations</p>
                <p className="mt-2 text-base font-bold text-white">Menus + tables</p>
              </div>
              <div className="card-premium p-5 border-slate-800 bg-slate-900/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Insights</p>
                <p className="mt-2 text-base font-bold text-white">Analytics snapshots</p>
              </div>
            </div>
          </div>
          <aside className="flex flex-col justify-center">
            <div className="rounded-[2.5rem] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-8 shadow-2xl">
              <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-md">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">App modules</p>
                <ul className="mt-6 space-y-4 text-sm text-slate-200">
                  <li className="flex items-center justify-between">
                    <span className="font-medium">Order management</span>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      Live
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="font-medium">Menu control</span>
                    <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                      Active
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="font-medium">Table + QR</span>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-[10px] font-bold text-slate-300 border border-slate-700">
                      Ready
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="font-medium">Analytics</span>
                    <span className="rounded-full bg-sky-500/10 px-3 py-1 text-[10px] font-bold text-sky-400 border border-sky-500/20">
                      Insights
                    </span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-5 text-center text-xs font-medium text-slate-400 backdrop-blur-sm">
                App-only access. Customers never land here.
              </div>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  if (hasBusinessToken) {
    redirect(new URL("/dashboard", appUrl).toString());
  }
  if (hasCustomerToken) {
    redirect("/explore");
  }

  redirect("/home");
}
