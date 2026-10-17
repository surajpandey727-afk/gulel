import type { Metadata, Viewport } from "next";
import { avantGarde } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "gulel — for nishaan-a", template: "%s · gulel" },
  description: "Commercial intelligence & outreach operating system",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "gulel — for nishaan-a",
    description: "Commercial intelligence & outreach operating system",
    url: "https://gulel.nishaan-a.com",
    siteName: "gulel",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "gulel — for nishaan-a",
    description: "Commercial intelligence & outreach operating system",
    images: ["/og.png"],
  },
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
