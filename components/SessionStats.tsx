"use client";

import { Activity, Coins, Flame, Vote } from "lucide-react";
import { useSessionStore } from "@/lib/store";
import { RankBar } from "./gamification/RankBar";
import { InfoTip } from "./InfoTip";

export function SessionStats() {
  const { accuracy, streak, votes, coins, rank } = useSessionStore();

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <section className="stats-hud" aria-label="Your session stats">
        <span className="stat-pill">
          <Activity size={15} aria-hidden="true" />
          Accuracy <strong>{accuracy}%</strong>
        </span>
        <span className="stat-pill">
          <Flame size={15} aria-hidden="true" />
          Streak <strong>{streak}</strong>
        </span>
        <span className="stat-pill">
          <Vote size={15} aria-hidden="true" />
          Votes <strong>{votes}</strong>
        </span>
        <span className="stat-pill" style={{ color: "var(--signal)" }}>
          <Coins size={15} aria-hidden="true" />
          Coins <strong>{coins.toLocaleString()}</strong>
          <InfoTip label="What are coins?">
            <strong>Coins</strong> are spendable credits — earn them every vote (with a 2× bonus chance), from quests, streaks, and daily logins. Spend them in the shop.
          </InfoTip>
        </span>
      </section>
      <RankBar rank={rank} compact />
    </div>
  );
}
