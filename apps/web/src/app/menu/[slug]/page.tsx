import Link from "next/link";

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
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Public Menu</h1>
        <p className="mt-2 text-sm text-gray-600">
          Business: <span className="font-medium">{slug}</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Table: <span className="font-medium">{table ?? "N/A"}</span>
        </p>
        <p className="mt-4 text-sm text-gray-600">
          Menu and ordering UI will be implemented in Layer 6. QR context routing is active.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href={`/qr/login?token=${encodeURIComponent(token ?? "")}`}
            className="rounded-md bg-black px-4 py-2 text-white"
          >
            QR Login
          </Link>
          <Link
            href={`/qr/register?token=${encodeURIComponent(token ?? "")}`}
            className="rounded-md border px-4 py-2"
          >
            QR Register
          </Link>
        </div>
      </div>
    </main>
  );
}
