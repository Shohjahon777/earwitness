import type { Metadata } from "next";
import Link from "next/link";
import { AppChrome } from "@/components/AppChrome";
import { ShareCard } from "@/components/share/ShareCard";
import { ShareButton } from "@/components/share/ShareButton";
import { getShareCard } from "@/lib/server/data";

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getShareCard(id);
  return {
    title: "Share card",
    description: data.tagline,
    openGraph: {
      title: "Earwitness share card",
      description: data.tagline,
      images: [`/c/${id}/og-image`]
    }
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getShareCard(id);

  return (
    <AppChrome mode="golden-ears">
      <section className="page-grid">
        <ShareCard data={data} />
        <div style={{ display: "grid", gap: 10 }}>
          <ShareButton shareId={id} label="Share this challenge" text={data.tagline} />
          <Link className="secondary-btn" href="/daily">
            Can you beat it?
          </Link>
          <Link className="secondary-btn" href="/">
            Vote on stacks
          </Link>
        </div>
      </section>
    </AppChrome>
  );
}
