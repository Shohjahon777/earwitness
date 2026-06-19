"use client";

import { CheckCircle2, Share2, XCircle } from "lucide-react";
import Link from "next/link";
import type { Channel, Pick, StackConfig, VoteResult } from "@/lib/types";
import { StackChips } from "@/components/StackChips";
import { RewardBurst } from "@/components/gamification/RewardBurst";
import { AchievementToast } from "@/components/gamification/AchievementToast";

export function RevealPanel({
  mode,
  result,
  userPick,
  onNext
}: {
  mode: "arena" | "golden-ears";
  result: VoteResult;
  userPick: Pick;
  onNext: () => void;
}) {
  const title =
    mode === "golden-ears"
      ? result.correct
        ? "Correct. That was the human."
        : "Close. The other clip was human."
      : userPick === "tie"
        ? "You called this one a tie."
        : `You picked channel ${userPick}.`;

  return (
    <aside className="reveal-panel" aria-modal="true" role="dialog" aria-labelledby="reveal-title">
      <div className="reveal-content">
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div
              className="stat-pill"
              style={{
                color: mode === "golden-ears" ? (result.correct ? "var(--human)" : "var(--danger)") : "var(--signal)"
              }}
            >
              {mode === "golden-ears" ? (
                result.correct ? (
                  <CheckCircle2 size={16} aria-hidden="true" />
                ) : (
                  <XCircle size={16} aria-hidden="true" />
                )
              ) : (
                <CheckCircle2 size={16} aria-hidden="true" />
              )}
              Reveal
            </div>
            <h2 id="reveal-title" className="font-display" style={{ margin: "10px 0 4px", fontSize: "1.55rem", lineHeight: 1.1 }}>
              {title}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {result.reveal.insight}
            </p>
          </div>

          <RewardBurst
            reward={result.reward}
            levelUp={result.levelUp}
            signalBits={result.signalBits}
            bonusOdds={result.bonusOdds}
            ear={result.ear}
          />
          {result.questsProgressed?.some((quest) => quest.completed) ? (
            <div className="quest-reward-list" aria-label="Completed quests">
              {result.questsProgressed
                .filter((quest) => quest.completed)
                .map((quest) => (
                  <span className="reward-chip reward-quest" key={quest.id}>
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {quest.label} +{quest.coins}
                  </span>
                ))}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            <RevealStack channel="A" stack={result.reveal.A} />
            <RevealStack channel="B" stack={result.reveal.B} />
          </div>

          <p className="muted" style={{ margin: 0 }}>
            {mode === "arena"
              ? userPick === "tie"
                ? "Some matchups expose tradeoffs. That split is useful signal for stack ranking."
                : "Most listeners agree when the stack handles timing and interruption cleanly."
              : result.correct
                ? "Your streak grows when you spot timing, hesitation, and repair cues."
                : "Most misses happen when a polished voice masks weak turn-taking."}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
            <button className="primary-btn" onClick={onNext}>
              Next round
            </button>
            {result.shareId ? (
              <Link className="secondary-btn" href={`/c/${result.shareId}`} aria-label="Share this matchup">
                <Share2 size={16} aria-hidden="true" />
                Share
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <AchievementToast achievements={result.achievementsUnlocked} />
    </aside>
  );
}

function RevealStack({ channel, stack }: { channel: Channel; stack: StackConfig }) {
  return (
    <section
      className="surface panel-pad"
      style={{ borderColor: stack.isHuman ? "color-mix(in srgb, var(--human), transparent 38%)" : undefined }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <strong className="font-display">
          Channel {channel}: {stack.name}
        </strong>
        {stack.isHuman ? <span className="stat-pill" style={{ color: "var(--human)" }}>Human</span> : null}
      </div>
      <StackChips stack={stack} />
    </section>
  );
}
