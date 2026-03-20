import Link from "next/link";
import { PublicSiteShell } from "../../../components/public/public-site-shell";

export default async function PublicMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string; token?: string }>;
}) {
  const { slug } = await params;
  const { table, token } = await searchParams;

  return (
    <PublicSiteShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="font-display text-3xl text-slate-900">Public menu preview</h1>
        <p className="mt-2 text-sm text-slate-600">
          Business: <span className="font-medium">{slug}</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Table: <span className="font-medium">{table ?? "N/A"}</span>
        </p>
        <p className="mt-4 text-sm text-slate-600">
          Menu and ordering UI will be implemented in Layer 6. QR context routing is active.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Customer access</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/qr/login?token=${encodeURIComponent(token ?? "")}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            QR Login
          </Link>
          <Link
            href={`/qr/register?token=${encodeURIComponent(token ?? "")}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            QR Register
          </Link>
        </div>
      </section>
    </PublicSiteShell>
  );
}
