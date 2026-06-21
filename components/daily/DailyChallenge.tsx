"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getDaily, submitDaily, type DailyResultPayload } from "@/lib/api";
import { countdownText } from "@/lib/format";
import type { DailyAnswer, Round } from "@/lib/types";
import { Coins } from "lucide-react";
import { useSessionStore } from "@/lib/store";
import { RoundProgress } from "@/components/RoundProgress";
import { ShareCard } from "@/components/share/ShareCard";
import { ShareButton } from "@/components/share/ShareButton";
import { RoundExperience } from "@/components/arena/RoundExperience";
import { AchievementToast } from "@/components/gamification/AchievementToast";

export function DailyChallenge() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [resetsAt, setResetsAt] = useState("");
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [result, setResult] = useState<DailyResultPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const applyDailyResult = useSessionStore((state) => state.applyDailyResult);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const daily = await getDaily();
        if (!alive) return;
        setRounds(daily.rounds);
        setAlreadyDone(daily.alreadyDone);
        setResetsAt(daily.resetsAt);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Daily challenge failed to load.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const current = rounds[index];
  const shareData = useMemo(
    () => ({
      stats: {
        id: result?.shareId ?? "daily-7f2",
        handle: "Listener-7F2",
        accuracy: result ? Math.round((result.score / 5) * 100) : 87,
        score: result?.score ?? 4,
        percentile: result?.percentile ?? 78,
        streak: 3,
        mode: "daily" as const
      },
      tagline: result ? `I scored ${result.score}/5 in today's golden-ears challenge.` : "I already played today's golden-ears challenge."
    }),
    [result]
  );

  async function advance() {
    if (index < rounds.length - 1) {
      setIndex((currentIndex) => currentIndex + 1);
      return;
    }
    const submitted = await submitDaily(answers);
    applyDailyResult(submitted);
    setResult(submitted);
  }

  if (loading) {
    return (
      <section className="page-grid">
        <div className="skeleton" style={{ minHeight: 110 }} />
        <div className="skeleton" style={{ minHeight: 420 }} />
      </section>
    );
  }

  if (error) {
    return (
      <section className="surface empty-state" role="alert">
        <strong>{error}</strong>
        <span className="muted">Retry the challenge when the cached set is available.</span>
      </section>
    );
  }

  if (alreadyDone || result) {
    return (
      <section className="page-grid">
        <div className="surface panel-pad">
          <h1 className="font-display" style={{ margin: 0, fontSize: "clamp(2rem, 10vw, 4rem)", lineHeight: 1 }}>
            Today&apos;s result
          </h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Come back in {countdownText(resetsAt)} for the next fixed set.
          </p>
          {result?.coinsEarned ? (
            <div className="reward-burst" style={{ marginTop: 12 }}>
              <span className="reward-chip reward-coins">
                <Coins size={15} aria-hidden="true" /> +{result.coinsEarned}
              </span>
              {result.xpEarned ? <span className="reward-chip reward-xp">+{result.xpEarned} signal</span> : null}
              {result.levelUp ? <span className="reward-chip reward-levelup">Rank up — {result.levelUp.rank}!</span> : null}
            </div>
          ) : null}
        </div>
        <ShareCard data={shareData} />
        <div style={{ display: "grid", gap: 10 }}>
          <ShareButton
            shareId={shareData.stats.id}
            label="Challenge a friend"
            text={
              result
                ? `I scored ${result.score}/5 spotting the AI on Earwitness. Can you beat me?`
                : "Can you spot the AI? Try today's Earwitness challenge."
            }
          />
          <Link className="secondary-btn" href={`/c/${shareData.stats.id}`}>
            View my card
          </Link>
        </div>
        <AchievementToast achievements={result?.achievementsUnlocked} />
      </section>
    );
  }

  if (!current) {
    return (
      <section className="surface empty-state">
        <strong>No daily set is ready.</strong>
        <span className="muted">Check the leaderboard while we cook more.</span>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <RoundProgress current={index + 1} total={rounds.length} />
      <RoundExperience
        mode="golden-ears"
        dailyRound={current}
        roundIndex={index}
        onDailyAnswer={(answer) => {
          setAnswers((currentAnswers) => {
            const without = currentAnswers.filter((item) => item.roundId !== answer.roundId);
            return [...without, answer];
          });
        }}
        onDailyNext={() => void advance()}
      />
    </section>
  );
}
