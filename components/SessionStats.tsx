"use client";

import { Activity, Flame, Vote } from "lucide-react";
import { useSessionStore } from "@/lib/store";

export function SessionStats() {
  const { accuracy, streak, votes } = useSessionStore();

  return (
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
    </section>
  );
}
