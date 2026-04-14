import { PublicMenuClient } from "../../../components/public/public-menu-client";
import { PublicSiteShell } from "../../../components/public/public-site-shell";

type PublicMenuApiResponse = {
  status: 1 | 0;
  data?: {
    business: { id: string; name: string; slug: string; currencyCode: string };
    table: { id: string; number: number } | null;
    categories: {
      id: string;
      name: string;
      sortOrder: number;
      items: {
        id: string;
        name: string;
        description: string | null;
        price: string;
        dietaryTags: string[];
        imageUrl: string | null;
        isAvailable: boolean;
        sortOrder: number;
      }[];
    }[];
  };
  error?: { message: string };
};

export default async function PublicMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string; token?: string }>;
}) {
  const { slug } = await params;
  const { table, token } = await searchParams;

  const apiBase =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4000";

  const url = new URL(`${apiBase}/api/public/menu/${encodeURIComponent(slug)}`);
  if (table) url.searchParams.set("table", table);
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const body = (await res.json()) as PublicMenuApiResponse;

  if (!res.ok || body.status !== 1 || !body.data) {
    const message = body.error?.message || "Menu is not available right now.";
    return (
      <PublicSiteShell headerAudience="customer">
        <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 className="font-display text-3xl text-slate-900">Menu unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
        </section>
      </PublicSiteShell>
    );
  }

  const cartKey = `cart:${body.data.business.slug}:${body.data.table?.id ?? "no-table"}:${token ?? "no-token"}`;

  return (
    <PublicSiteShell headerAudience="customer">
      <PublicMenuClient data={body.data} cartKey={cartKey} />
    </PublicSiteShell>
  );
}
