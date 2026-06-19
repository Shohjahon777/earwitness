import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Earwitness",
    template: "%s | Earwitness"
  },
  description:
    "Blind-test deployable voice AI stacks and see whether your ear can spot the human.",
  openGraph: {
    title: "Earwitness",
    description:
      "Blind-test deployable voice AI stacks and compare your ear against the crowd.",
    type: "website"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14131A"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={GeistMono.variable}>{children}</body>
    </html>
  );
}
