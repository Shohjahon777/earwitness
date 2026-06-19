"use client";

import type { RankInfo } from "@/lib/types";
import { InfoTip } from "@/components/InfoTip";

// XP-to-next-rank progress bar. The visible "almost there" fill is the endowed-progress pull.
export function RankBar({ rank, compact = false }: { rank: RankInfo | null; compact?: boolean }) {
  if (!rank) return null;
  const pct = Math.round(rank.progress * 100);
  const toNext = rank.xpForNext != null ? Math.max(0, rank.xpForNext - rank.xpInto) : 0;

  return (
    <div className="rank-bar" data-compact={compact}>
      <div className="rank-bar-head">
        <span className="font-display rank-name">
          {rank.rank}
          {!compact ? (
            <InfoTip label="What is signal?">
              <strong>Signal</strong> is permanent XP — it never gets spent. It raises your Ear Rank. Harder golden-ears catches earn more.
            </InfoTip>
          ) : null}
        </span>
        <span className="font-mono muted">
          {rank.xpForNext != null ? `${toNext} signal to next` : "Max rank"}
        </span>
      </div>
      <div className="rank-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Rank progress">
        <span className="rank-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
