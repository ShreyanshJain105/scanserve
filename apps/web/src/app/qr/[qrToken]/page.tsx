import { redirect } from "next/navigation";

type QrResolveResponse = {
  status: 1 | 0;
  data?: {
    qr: {
      token: string;
      business: { id: string; slug: string; name: string };
      table: { id: string; number: number };
    };
  };
  error?: { code?: string; message: string };
};

export default async function QrEntryPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const apiUrl =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4000";
  const res = await fetch(
    `${apiUrl}/api/public/qr/${encodeURIComponent(qrToken)}`,
    { cache: "no-store" }
  );

  const body = (await res.json()) as QrResolveResponse;
  if (!res.ok || body.status !== 1 || !body.data?.qr) {
    redirect(`/qr/login?token=${encodeURIComponent(qrToken)}`);
  }

  const { business, table } = body.data.qr;
  redirect(
    `/menu/${encodeURIComponent(business.slug)}?table=${table.number}&token=${encodeURIComponent(qrToken)}`
  );
}
