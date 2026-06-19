import type { Metadata } from "next";
import { AppChrome } from "@/components/AppChrome";
import { ShopView } from "@/components/gamification/ShopView";

export const metadata: Metadata = {
  title: "Shop",
  description: "Spend your coins on themes, streak freezes, and hints.",
};

export default function ShopPage() {
  return (
    <AppChrome>
      <ShopView />
    </AppChrome>
  );
}
