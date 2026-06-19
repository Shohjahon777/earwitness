import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
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

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  // Apply the user's equipped cosmetic theme server-side to avoid a flash on load.
  const theme = (await cookies()).get("ew_theme")?.value ?? "booth";
  return (
    <html lang="en" data-theme={theme}>
      <body className={GeistMono.variable}>{children}</body>
    </html>
  );
}
