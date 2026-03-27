import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function resolveRootTarget() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;
  const qrAccessToken = cookieStore.get("qr_customer_access")?.value;
  const qrRefreshToken = cookieStore.get("qr_customer_refresh")?.value;

  if (accessToken || refreshToken || qrAccessToken || qrRefreshToken) return "/explore";
  return "/home";
}

export default async function RootPage() {
  redirect(await resolveRootTarget());
}
