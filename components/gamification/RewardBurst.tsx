"use client";

import { Coins, Ear, Sparkles, Zap } from "lucide-react";
import type { EarInfo, VoteReward } from "@/lib/types";

// The reward moment: shown inside the RevealPanel after a vote. The 2× "signal bonus" and
// streak jackpot are the variable-reward payoffs; "signal" XP is the info-theoretic award and
// `ear` is the Glicko rating update.
export function RewardBurst({
  reward,
  levelUp,
  signalBits,
  bonusOdds,
  ear,
}: {
  reward?: VoteReward;
  levelUp?: { level: number; rank: string };
  signalBits?: number;
  bonusOdds?: number;
  ear?: EarInfo;
}) {
  if (!reward) return null;

  return (
    <div className="reward-burst" aria-live="polite">
      <span className="reward-chip reward-coins">
        <Coins size={15} aria-hidden="true" />+{reward.coins}
      </span>
      <span className="reward-chip reward-xp" title={signalBits ? "Information-theoretic signal (Shannon bits)" : undefined}>
        <Zap size={15} aria-hidden="true" />+{reward.xp} signal
      </span>
      {reward.bonus ? (
        <span className="reward-chip reward-bonus">
          <Sparkles size={15} aria-hidden="true" />2× signal bonus
        </span>
      ) : typeof bonusOdds === "number" ? (
        <span className="reward-chip" title="Pity timer: your 2× chance rises until it's guaranteed">
          2× chance {Math.round(bonusOdds * 100)}%
        </span>
      ) : null}
      {reward.jackpot > 0 ? <span className="reward-chip reward-jackpot">+{reward.jackpot} streak jackpot</span> : null}
      {ear ? (
        <span className="reward-chip" title="Your Glicko-2 ear rating ±95% confidence">
          <Ear size={15} aria-hidden="true" />
          {ear.rating} ±{ear.ci}
        </span>
      ) : null}
      {levelUp ? <span className="reward-chip reward-levelup">Rank up — {levelUp.rank}!</span> : null}
    </div>
  );
}
