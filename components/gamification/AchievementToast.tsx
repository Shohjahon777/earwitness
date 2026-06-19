"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import type { AchievementView } from "@/lib/types";

// Fixed overlay that announces newly-unlocked achievements, one banner per unlock.
export function AchievementToast({ achievements }: { achievements?: AchievementView[] }) {
  const [queue, setQueue] = useState<AchievementView[]>([]);

  useEffect(() => {
    if (achievements && achievements.length) setQueue((q) => [...q, ...achievements]);
  }, [achievements]);

  useEffect(() => {
    if (queue.length === 0) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 3200);
    return () => clearTimeout(t);
  }, [queue]);

  if (queue.length === 0) return null;
  const a = queue[0];

  return (
    <div className="achievement-toast" role="status">
      <Award size={20} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <strong className="font-display">Achievement unlocked</strong>
        <div className="font-mono">
          {a.label} · +{a.coins} coins
        </div>
      </div>
    </div>
  );
}
