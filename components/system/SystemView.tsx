"use client";

import { useEffect, useState } from "react";
import { Activity, Coins, Dice5, Ear, Sigma } from "lucide-react";
import { getSystemStats } from "@/lib/api";
import type { SystemStats } from "@/lib/types";

// The "engineering" showcase: the real algorithms behind the Ear Engine, with live telemetry.
export function SystemView() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await getSystemStats();
        if (alive) setStats(s);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Couldn't load system stats.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="page-grid">
      <div className="surface panel-pad">
        <span className="operator-eyebrow">Under the hood</span>
        <h1 className="font-display" style={{ margin: "4px 0 0", fontSize: "clamp(2rem, 10vw, 4rem)", lineHeight: 0.96 }}>
          The Ear Engine
        </h1>
        <p className="muted" style={{ margin: "12px 0 0", maxWidth: 760 }}>
          Earwitness treats "having a good ear" as a measurable, uncertain skill — and rewards it with
          information, not flat points. Four systems run the loop. The numbers below are live.
        </p>
      </div>

      {error ? <div className="surface empty-state" role="alert"><strong>{error}</strong></div> : null}

      {/* 1. Glicko-2 ear rating */}
      <article className="surface panel-pad system-block">
        <h2 className="font-display"><Ear size={18} aria-hidden="true" /> Glicko-2 ear rating</h2>
        <p className="muted">
          Each golden-ears round is a two-player game: your <em>ear</em> rating vs the AI stack&apos;s
          <em> deception</em> rating. Spotting the human is a win; being fooled is a loss. Both sides update
          with uncertainty (RD) and volatility (σ) — so a new player&apos;s rating moves fast and a veteran&apos;s
          barely budges. It is the per-listener twin of the Bradley–Terry model we run on stacks.
        </p>
        <pre className="formula">{`E = 1 / (1 + exp(-g(φ_opp)·(μ − μ_opp)))      # expected win prob
v = 1 / (g²·E·(1−E))                          # outcome variance
σ' ← solve f(x)=0  (Illinois iteration)       # new volatility
φ' = 1 / √(1/(φ²+σ'²) + 1/v),  μ' = μ + φ'²·g·(s − E)`}</pre>
        {stats ? (
          <>
            <p className="muted system-sub">
              {stats.ear.players} rated listeners · mean uncertainty ±{Math.round(1.96 * stats.ear.avgRd)} pts
            </p>
            <BarChart data={stats.ear.buckets.map((b) => ({ label: b.label, value: b.count }))} accent="var(--channel-a)" />
          </>
        ) : (
          <div className="skeleton" style={{ minHeight: 120 }} />
        )}
      </article>

      {/* 2. Information-theoretic signal */}
      <article className="surface panel-pad system-block">
        <h2 className="font-display"><Sigma size={18} aria-hidden="true" /> Information-theoretic signal</h2>
        <p className="muted">
          "Signal" (XP) is Shannon surprisal. If the model expected you to win with probability E, a correct
          call is worth <code>−log₂(E)</code> bits — catching a <em>convincing</em> fake (low E) pays far more
          than an obvious one. Reward tracks how much you actually proved, not how many taps you made.
        </p>
        <pre className="formula">{`signal = base · −log₂(E)      if correct
signal = base · −log₂(1−E)·γ  if wrong   (small consolation)`}</pre>
        <BarChart
          data={[
            { label: "E=0.9 (easy)", value: 0.15 },
            { label: "E=0.7", value: 0.51 },
            { label: "E=0.5", value: 1.0 },
            { label: "E=0.3 (hard)", value: 1.74 },
            { label: "E=0.1 (deceptive)", value: 3.32 },
          ]}
          accent="var(--signal)"
          format={(v) => `${v.toFixed(2)} bits`}
        />
      </article>

      {/* 3. Pity-timer reward */}
      <article className="surface panel-pad system-block">
        <h2 className="font-display"><Dice5 size={18} aria-hidden="true" /> Pity-timed variable reward</h2>
        <p className="muted">
          The 2× coin bonus is variable-ratio (the addictive part) but <em>fair</em>: probability rises every
          dry vote and is <strong>guaranteed</strong> by the hard cap, so no one gets unlucky forever. This is
          the gacha "bad-luck protection" pattern, made explicit.
        </p>
        {stats ? (
          <>
            <pre className="formula">{`P(bonus | dry) = min(1, ${stats.config.pity.base} + ${stats.config.pity.step}·dry),  guaranteed at dry=${stats.config.pity.hard}`}</pre>
            <LineChart values={stats.config.pityCurve} accent="var(--human)" />
          </>
        ) : (
          <div className="skeleton" style={{ minHeight: 120 }} />
        )}
      </article>

      {/* 4. Economy faucet/sink */}
      <article className="surface panel-pad system-block">
        <h2 className="font-display"><Coins size={18} aria-hidden="true" /> Dual-currency economy</h2>
        <p className="muted">
          Coins are <em>soft</em> currency (spendable); signal is <em>hard</em> currency (permanent status).
          Every coin movement is logged as a faucet (earned) or sink (spent), so inflation is observable.
          Below is the live net flow across all listeners.
        </p>
        {stats ? (
          <>
            <div className="econ-stats">
              <span className="stat-pill"><Activity size={15} aria-hidden="true" /> minted <strong>{stats.economy.minted.toLocaleString()}</strong></span>
              <span className="stat-pill"> burned <strong>{stats.economy.burned.toLocaleString()}</strong></span>
              <span className="stat-pill" style={{ color: "var(--signal)" }}> circulating <strong>{stats.economy.circulating.toLocaleString()}</strong></span>
            </div>
            <div className="econ-cols">
              <div>
                <span className="muted system-sub">Faucets</span>
                <BarChart data={stats.economy.sources.map((s) => ({ label: s.source, value: s.total }))} accent="var(--human)" />
              </div>
              <div>
                <span className="muted system-sub">Sinks</span>
                <BarChart data={stats.economy.sinks.map((s) => ({ label: s.source, value: s.total }))} accent="var(--channel-b)" />
              </div>
            </div>
          </>
        ) : (
          <div className="skeleton" style={{ minHeight: 140 }} />
        )}
      </article>
    </section>
  );
}

// --- tiny self-contained charts (no deps) ---
function BarChart({
  data,
  accent,
  format,
}: {
  data: { label: string; value: number }[];
  accent: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="bar-label font-mono">{d.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: accent }} />
          </span>
          <span className="bar-value font-mono">{format ? format(d.value) : d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ values, accent }: { values: number[]; accent: string }) {
  const w = 100;
  const h = 36;
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - v * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg className="line-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label="Probability curve">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`color-mix(in srgb, ${accent}, transparent 86%)`} stroke="none" />
      <polyline points={pts} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
