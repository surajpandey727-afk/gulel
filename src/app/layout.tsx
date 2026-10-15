import type { Metadata, Viewport } from "next";
import { avantGarde } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "gulel — for nishaan-a", template: "%s · gulel" },
  description: "Commercial intelligence & outreach operating system",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ece8e2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={avantGarde.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
