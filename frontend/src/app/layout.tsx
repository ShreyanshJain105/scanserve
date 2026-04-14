import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { ToastViewport } from "../components/ui/toast-viewport";

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
      <body>
        <AuthProvider>
          {children}
          <ToastViewport />
        </AuthProvider>
      </body>
    </html>
  );
}
