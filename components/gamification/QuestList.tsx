"use client";

import { CheckCircle2, Coins, Target } from "lucide-react";
import type { QuestView } from "@/lib/types";

// Daily quests with progress bars. The "7/10" near-completion state is the Zeigarnik pull.
export function QuestList({ quests }: { quests: QuestView[] }) {
  if (!quests.length) return null;
  return (
    <section className="quest-list" aria-label="Daily quests">
      {quests.map((q) => {
        const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
        return (
          <article className="quest-card" data-claimed={q.claimed} key={q.id}>
            <div className="quest-head">
              {q.claimed ? <CheckCircle2 size={16} aria-hidden="true" /> : <Target size={16} aria-hidden="true" />}
              <strong>{q.label}</strong>
              <span className="quest-reward font-mono">
                <Coins size={13} aria-hidden="true" />
                {q.coins}
              </span>
            </div>
            <div className="quest-track">
              <span className="quest-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono muted quest-count">
              {q.claimed ? "Complete" : `${q.progress}/${q.target}`}
            </span>
          </article>
        );
      })}
    </section>
  );
}
