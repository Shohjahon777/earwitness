import type { Metadata } from "next";
import { AppChrome } from "@/components/AppChrome";
import { SystemView } from "@/components/system/SystemView";

export const metadata: Metadata = {
  title: "The engine",
  description: "How Earwitness scores ears and balances its economy — Glicko-2, information theory, and a pity-timed reward loop.",
};

export default function SystemPage() {
  return (
    <AppChrome>
      <SystemView />
    </AppChrome>
  );
}
