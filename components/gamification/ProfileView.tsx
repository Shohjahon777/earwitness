"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Coins, Flame, Lock, Snowflake } from "lucide-react";
import { getMe } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import type { Me } from "@/lib/types";
import { RankBar } from "./RankBar";
import { QuestList } from "./QuestList";

export function ProfileView() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setProfile = useSessionStore((s) => s.setProfile);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await getMe();
        if (!alive) return;
        setMe(data);
        setProfile(data);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Couldn't load your profile.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [setProfile]);

  if (error) {
    return (
      <section className="surface empty-state" role="alert">
        <strong>{error}</strong>
        <span className="muted">Vote a round to start your profile.</span>
      </section>
    );
  }

  if (!me) {
    return (
      <section className="page-grid">
        <div className="skeleton" style={{ minHeight: 150 }} />
        <div className="skeleton" style={{ minHeight: 220 }} />
      </section>
    );
  }

  const achievements = me.achievements ?? [];
  const unlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <section className="page-grid">
      <div className="surface panel-pad" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="font-display" style={{ margin: 0, fontSize: "clamp(1.8rem, 9vw, 3.2rem)", lineHeight: 1 }}>
            {me.handle}
          </h1>
          <Link className="secondary-btn" href="/shop">
            <Coins size={16} aria-hidden="true" /> Shop
          </Link>
        </div>
        <RankBar rank={me.rank ?? null} />
        <div className="profile-stat-row">
          <span className="stat-pill" style={{ color: "var(--signal)" }}>
            <Coins size={15} aria-hidden="true" /> {me.coins?.toLocaleString() ?? 0} coins
          </span>
          <span className="stat-pill">
            <Flame size={15} aria-hidden="true" /> {me.loginStreak ?? 0}-day login
          </span>
          <span className="stat-pill">
            <Snowflake size={15} aria-hidden="true" /> {me.freezesOwned ?? 0} freezes
          </span>
          <span className="stat-pill">
            Accuracy <strong>{me.accuracy}%</strong>
          </span>
          <span className="stat-pill">
            Best streak <strong>{me.longestStreak ?? 0}</strong>
          </span>
        </div>
      </div>

      <div className="surface panel-pad" style={{ display: "grid", gap: 12 }}>
        <h2 className="font-display" style={{ margin: 0 }}>Today&apos;s quests</h2>
        <QuestList quests={me.quests ?? []} />
      </div>

      <div className="surface panel-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 className="font-display" style={{ margin: 0 }}>Achievements</h2>
          <span className="font-mono muted">{unlocked}/{achievements.length}</span>
        </div>
        <div className="achievement-grid">
          {achievements.map((a) => (
            <article className="achievement-card" data-unlocked={a.unlocked} key={a.id}>
              {a.unlocked ? <Award size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
              <strong>{a.label}</strong>
              <span className="muted">{a.desc}</span>
              <span className="font-mono achievement-reward">+{a.coins} coins</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
