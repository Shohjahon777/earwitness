"use client";

import { useEffect, useState } from "react";
import { getLeaderboard, getListeners, getMe } from "@/lib/api";
import type { Dimension, LeaderboardRow, Me } from "@/lib/types";
import { StackChips } from "@/components/StackChips";
import { DimensionTabs } from "./DimensionTabs";

export function LeaderboardTable() {
  const [tab, setTab] = useState<"stacks" | "listeners">("stacks");
  const [dimension, setDimension] = useState<Dimension>("overall");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [listeners, setListeners] = useState<Me[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [nextRows, nextListeners, nextMe] = await Promise.all([getLeaderboard(dimension), getListeners(), getMe()]);
        if (!alive) return;
        setRows(nextRows);
        setListeners(nextListeners);
        setMe(nextMe);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Leaderboard failed to load.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [dimension]);

  return (
    <section className="page-grid">
      <div className="surface panel-pad" style={{ display: "grid", gap: 14 }}>
        <div>
          <h1 className="font-display" style={{ margin: 0, fontSize: "clamp(2rem, 10vw, 4rem)", lineHeight: 1 }}>
            Leaderboard
          </h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Stacks are ranked as full deployable systems, not as isolated voices.
          </p>
        </div>
        <div className="tabs" role="tablist" aria-label="Leaderboard tabs">
          <button data-active={tab === "stacks"} onClick={() => setTab("stacks")}>
            Stacks
          </button>
          <button data-active={tab === "listeners"} onClick={() => setTab("listeners")}>
            Listeners
          </button>
        </div>
        {tab === "stacks" ? <DimensionTabs value={dimension} onChange={setDimension} /> : null}
      </div>

      {error ? (
        <div className="surface empty-state" role="alert">
          <strong>{error}</strong>
          <button className="primary-btn" onClick={() => setDimension((current) => current)}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="leaderboard-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton" key={index} style={{ minHeight: 124 }} />
          ))}
        </div>
      ) : tab === "stacks" ? (
        rows.length ? (
          <div className="leaderboard-grid">
            {rows.map((row) => (
              <article className="leaderboard-row" key={row.stack.id}>
                <span className="rank">#{row.rank}</span>
                <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong className="font-display">{row.stack.name}</strong>
                      <div className="font-mono muted" style={{ fontSize: ".78rem" }}>
                        {row.rating} +/- {row.ratingCI} · {row.votes.toLocaleString()} votes
                      </div>
                      <div className="rating-strip" aria-label="Dimension scores">
                        <span className="rating-chip">Naturalness <strong>{row.naturalness ?? row.rating}</strong></span>
                        <span className="rating-chip">Interaction <strong>{row.interaction ?? row.rating}</strong></span>
                      </div>
                      {row.stack.id === "pretty-rude" ? (
                        <div className="proof-note">Great voice, weak interruption handling. This is why stacks matter.</div>
                      ) : null}
                    </div>
                    <Sparkline values={row.trend} />
                  </div>
                  <StackChips stack={row.stack} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyLeaderboard />
        )
      ) : listeners.length ? (
        <div className="leaderboard-grid">
          {listeners.map((listener) => (
            <article className="leaderboard-row" data-pinned={listener.sessionId === me?.sessionId} key={listener.sessionId}>
              <span className="rank">{listener.sessionId === me?.sessionId ? "You" : `${listener.accuracy}%`}</span>
              <div style={{ minWidth: 0 }}>
                <strong className="font-display">{listener.handle}</strong>
                <div className="font-mono muted" style={{ fontSize: ".82rem" }}>
                  Accuracy {listener.accuracy}% · longest streak {listener.longestStreak ?? listener.streak} · daily {listener.dailyScore ?? 0}/5
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyLeaderboard />
      )}
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 30 - ((value - min) / Math.max(1, max - min)) * 26;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyLeaderboard() {
  return (
    <div className="surface empty-state">
      <strong className="font-display">Voting just opened.</strong>
      <span className="muted">Be the first to rank a stack.</span>
    </div>
  );
}
