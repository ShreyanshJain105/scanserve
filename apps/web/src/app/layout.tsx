import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scan2Serve",
  description: "Digital menu platform with QR code ordering for restaurants",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
