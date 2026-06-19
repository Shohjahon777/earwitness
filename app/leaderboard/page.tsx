import type { Metadata } from "next";
import { AppChrome } from "@/components/AppChrome";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

export const metadata: Metadata = {
  title: "Leaderboard"
};

export default function LeaderboardPage() {
  return (
    <AppChrome mode="arena">
      <LeaderboardTable />
    </AppChrome>
  );
}
