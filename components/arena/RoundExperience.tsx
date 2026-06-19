"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RadioTower } from "lucide-react";
import { getRound, submitVote } from "@/lib/api";
import { readMockFlag } from "@/lib/mock-flags";
import { useSessionStore } from "@/lib/store";
import type { Channel, Mode, Pick, Round, VoteResult } from "@/lib/types";
import { BalanceIndicator } from "@/components/BalanceIndicator";
import { ScenarioChip } from "@/components/ScenarioChip";
import { SessionStats } from "@/components/SessionStats";
import { Toast } from "@/components/Toast";
import { VoteBar } from "@/components/VoteBar";
import { ClipCard } from "./ClipCard";
import { RevealPanel } from "./RevealPanel";
import { HintButton } from "@/components/gamification/HintButton";

export function RoundExperience({
  mode,
  dailyRound,
  onDailyAnswer,
  onDailyNext,
  roundIndex
}: {
  mode: Mode;
  dailyRound?: Round;
  onDailyAnswer?: (answer: { roundId: string; pick: Pick; correct?: boolean }) => void;
  onDailyNext?: () => void;
  roundIndex?: number;
}) {
  const [round, setRound] = useState<Round | null>(dailyRound ?? null);
  const [loading, setLoading] = useState(!dailyRound);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Channel | null>(null);
  const [played, setPlayed] = useState<Record<Channel, boolean>>({ A: false, B: false });
  const [playCommands, setPlayCommands] = useState<Record<Channel, number>>({ A: 0, B: 0 });
  const [pick, setPick] = useState<Pick | null>(null);
  const [result, setResult] = useState<VoteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const applyVoteResult = useSessionStore((state) => state.applyVoteResult);
  const mock = typeof window === "undefined" ? null : readMockFlag();

  const loadRound = useCallback(async () => {
    if (dailyRound) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPick(null);
    setPlayed({ A: false, B: false });
    setActive(null);
    try {
      setRound(await getRound(mode));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No matchups right now. Check the leaderboard while we cook more.");
    } finally {
      setLoading(false);
    }
  }, [dailyRound, mode]);

  useEffect(() => {
    if (dailyRound) {
      setRound(dailyRound);
      setResult(null);
      setPick(null);
      setPlayed({ A: false, B: false });
      setActive(null);
      return;
    }
    void loadRound();
  }, [dailyRound, loadRound]);

  const requestPlay = useCallback((channel: Channel) => {
    setActive((current) => (current === channel ? current : channel));
  }, []);

  const commandPlay = useCallback((channel: Channel) => {
    setPlayCommands((current) => ({ ...current, [channel]: current[channel] + 1 }));
  }, []);

  const ready = played.A && played.B && !result && !submitting;

  const vote = useCallback(
    async (nextPick: Pick) => {
      if (!round || !ready) return;
      setSubmitting(true);
      setPick(nextPick);
      setActive(null);
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        const nextResult = await submitVote(round.id, nextPick);
        setResult(nextResult);
        applyVoteResult(nextResult);
        onDailyAnswer?.({ roundId: round.id, pick: nextPick, correct: nextResult.correct });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Vote failed. Try again.");
        setPick(null);
      } finally {
        setSubmitting(false);
      }
    },
    [onDailyAnswer, ready, round, applyVoteResult]
  );

  const next = useCallback(() => {
    if (dailyRound) return;
    void loadRound();
  }, [dailyRound, loadRound]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === "a") commandPlay("A");
      if (event.key.toLowerCase() === "b") commandPlay("B");
      if (event.key === "1") void vote("A");
      if (event.key === "2") void vote("B");
      if (event.key === "Enter" && result) {
        if (dailyRound) onDailyNext?.();
        else next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandPlay, dailyRound, next, onDailyNext, result, vote]);

  if (loading) {
    return <RoundSkeleton mode={mode} />;
  }

  if (error || !round) {
    return (
      <section className="surface empty-state">
        <RadioTower size={30} style={{ margin: "0 auto", color: "var(--signal)" }} aria-hidden="true" />
        <strong className="font-display">{error ?? "No matchups right now."}</strong>
        <span className="muted">Check the leaderboard while we cook more signal.</span>
        <div style={{ display: "grid", gap: 10 }}>
          <button className="primary-btn" onClick={() => void loadRound()}>
            Retry round
          </button>
          <Link className="secondary-btn" href="/leaderboard">
            Open leaderboard
          </Link>
        </div>
      </section>
    );
  }

  const question = mode === "golden-ears" ? "Which one is the human?" : "Which stack is better?";
  const disabledReason =
    played.A || played.B
      ? "Listen to both clips to vote."
      : "Listen to both to vote. Tap A and B, or press A/B.";

  return (
    <div className="page-grid" data-layout="arena">
      <section style={{ display: "grid", gap: 14 }}>
        {mock === "offline" ? <Toast message="You're offline - votes will send when you reconnect." /> : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <ScenarioChip label={round.scenario.label} />
          {typeof roundIndex === "number" ? <span className="font-mono muted">Round {roundIndex + 1}</span> : null}
          {mode === "golden-ears" && !result ? <HintButton roundId={round.id} /> : null}
        </div>
        <ClipCard
          channel="A"
          clip={round.clipA}
          active={active === "A"}
          dimmed={active === "B"}
          voted={pick === "A"}
          heard={played.A}
          playCommand={playCommands.A}
          onPlay={requestPlay}
          onPlayed={(channel) => setPlayed((current) => ({ ...current, [channel]: true }))}
          onEnded={() => setActive(null)}
        />
        <BalanceIndicator
          prompt={question}
          tilt={pick === "A" ? -1 : pick === "B" ? 1 : 0}
          pulsing={ready}
          leftReady={played.A}
          rightReady={played.B}
        />
        <ClipCard
          channel="B"
          clip={round.clipB}
          active={active === "B"}
          dimmed={active === "A"}
          voted={pick === "B"}
          heard={played.B}
          playCommand={playCommands.B}
          onPlay={requestPlay}
          onPlayed={(channel) => setPlayed((current) => ({ ...current, [channel]: true }))}
          onEnded={() => setActive(null)}
        />
      </section>

      <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <section className="surface panel-pad operator-panel">
          <div>
            <span className="operator-eyebrow">Blind test console</span>
            <h1 className="font-display" style={{ margin: 0, fontSize: "clamp(1.65rem, 8vw, 3rem)", lineHeight: 1 }}>
              {mode === "golden-ears" ? "Test your ear." : "Rank the stack."}
            </h1>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              {mode === "golden-ears"
                ? "One clip is a real human. The other is a deployable AI stack."
                : "You are judging the whole voice-agent stack: STT, LLM, TTS, and turn handling."}
            </p>
          </div>
          <SessionStats />
        </section>
        <VoteBar
          enabled={ready}
          mode={mode}
          onVote={(nextPick) => void vote(nextPick)}
          disabledReason={disabledReason}
          submitting={submitting}
          heardA={played.A}
          heardB={played.B}
        />
      </aside>

      {result && pick ? <RevealPanel mode={mode} result={result} userPick={pick} onNext={dailyRound ? onDailyNext ?? (() => undefined) : next} /> : null}
    </div>
  );
}

function RoundSkeleton({ mode }: { mode: Mode }) {
  return (
    <div className="page-grid" data-layout="arena">
      <section style={{ display: "grid", gap: 14 }}>
        <div className="skeleton" style={{ minHeight: 40 }} />
        <div className="clip-card" style={{ "--channel-color": "var(--channel-a)" } as React.CSSProperties}>
            <div className="clip-card-inner">
              <div className="skeleton" style={{ minHeight: 38 }} />
            <div className="skeleton" />
          </div>
        </div>
        <BalanceIndicator prompt={mode === "golden-ears" ? "Which one is the human?" : "Which stack is better?"} tilt={0} pulsing={false} />
        <div className="clip-card" style={{ "--channel-color": "var(--channel-b)" } as React.CSSProperties}>
          <div className="clip-card-inner">
            <div className="skeleton" style={{ minHeight: 38 }} />
            <div className="skeleton" />
          </div>
        </div>
      </section>
    </div>
  );
}
