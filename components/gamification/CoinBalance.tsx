"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useSessionStore } from "@/lib/store";

// Top-bar coin pill. Compacts to icon+count on mobile via the .coin-pill class.
export function CoinBalance() {
  const coins = useSessionStore((s) => s.coins);
  const rank = useSessionStore((s) => s.rank);

  return (
    <Link className="coin-pill" href="/shop" aria-label={`${coins} coins. Open shop.`} title="Open shop">
      <Coins size={15} aria-hidden="true" />
      <strong className="font-mono">{coins.toLocaleString()}</strong>
      {rank ? <span className="coin-rank">{rank.rank}</span> : null}
    </Link>
  );
}
