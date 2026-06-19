import type { Metadata } from "next";
import { AppChrome } from "@/components/AppChrome";
import { DailyChallenge } from "@/components/daily/DailyChallenge";

export const metadata: Metadata = {
  title: "Daily challenge"
};

export default function DailyPage() {
  return (
    <AppChrome mode="golden-ears">
      <DailyChallenge />
    </AppChrome>
  );
}
