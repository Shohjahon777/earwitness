import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Zap, Flame, Trophy, ArrowRight } from "lucide-react";
import { AppChrome } from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "How it works"
};

export default function AboutPage() {
  return (
    <AppChrome mode="arena">
      <section className="page-grid">
        <div className="surface panel-pad">
          <h1 className="font-display" style={{ margin: 0, fontSize: "clamp(2.2rem, 11vw, 4.8rem)", lineHeight: 0.95 }}>
            How it works
          </h1>
          <p className="muted" style={{ margin: "14px 0 0", maxWidth: 720 }}>
            Earwitness compares complete voice-agent stacks. A stack includes speech recognition, the language model, text-to-speech, and turn handling. You are never ranking a single voice in isolation.
          </p>
          <p className="muted" style={{ margin: "12px 0 0", maxWidth: 720 }}>
            Clips are pre-generated and cached, but each pair uses the same scripted scenario. That lets everyone judge timing, interruptions, pauses, and recovery without waiting for live inference.
          </p>
        </div>

        <div className="diagram" data-flow="true" aria-label="Voice stack diagram">
          {[
            ["Audio in", "Same scenario, same script, different stack."],
            ["STT", "Turns caller audio into text."],
            ["LLM", "Chooses the next agent move."],
            ["TTS", "Speaks the response naturally."],
            ["Turns", "Yields, pauses, and repairs."],
            ["Vote", "Your ear ranks the whole deployed agent."],
          ].map(([label, copy]) => (
            <div className="diagram-step" key={label}>
              <strong className="font-display">{label}</strong>
              <span className="muted">{copy}</span>
            </div>
          ))}
        </div>

        {/* Economy explainer — plain language */}
        <div className="surface panel-pad" style={{ display: "grid", gap: 14 }}>
          <h2 className="font-display" style={{ margin: 0 }}>Coins &amp; signal</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 720 }}>
            You earn two things as you play. They do different jobs.
          </p>
          <div className="explainer-grid">
            <div className="explainer-card">
              <span className="explainer-ic" style={{ color: "var(--signal)" }}><Coins size={18} aria-hidden="true" /></span>
              <strong className="font-display">Coins — your spendable credits</strong>
              <span className="muted">Earned on every vote (with a chance of a 2× bonus), from quests, streaks, daily play, and logging in. Spend them in the shop on themes, streak freezes, and hints.</span>
            </div>
            <div className="explainer-card">
              <span className="explainer-ic" style={{ color: "var(--channel-a)" }}><Zap size={18} aria-hidden="true" /></span>
              <strong className="font-display">Signal — your permanent progress</strong>
              <span className="muted">Signal (XP) never gets spent. It raises your Ear Rank (Static → Perfect Pitch). In golden-ears, spotting a <em>convincing</em> fake is worth more signal than an easy one.</span>
            </div>
            <div className="explainer-card">
              <span className="explainer-ic" style={{ color: "var(--signal)" }}><Flame size={18} aria-hidden="true" /></span>
              <strong className="font-display">Streaks keep you sharp</strong>
              <span className="muted">A correct-answer streak multiplies rewards; a separate daily-login streak grows a bonus each day you return. A streak freeze (shop) protects it if you miss a day.</span>
            </div>
            <div className="explainer-card">
              <span className="explainer-ic" style={{ color: "var(--human)" }}><Trophy size={18} aria-hidden="true" /></span>
              <strong className="font-display">Quests &amp; achievements</strong>
              <span className="muted">Three quests refresh daily; achievements unlock at milestones. Both pay coins and signal. Track them on your profile.</span>
            </div>
          </div>

          <h3 className="font-display" style={{ margin: "6px 0 0" }}>How to earn coins fast</h3>
          <ul className="explainer-list muted">
            <li>Vote rounds in the Arena — every vote pays, and ~1 in 8 hits a 2× bonus.</li>
            <li>Play golden-ears correctly to multiply rewards with your streak.</li>
            <li>Finish the daily challenge and your 3 daily quests.</li>
            <li>Come back each day — the login bonus escalates.</li>
          </ul>
        </div>

        <Link className="surface panel-pad system-link" href="/system">
          <div>
            <strong className="font-display">Go deeper — the engineering</strong>
            <span className="muted">Glicko-2 ear rating, information-theoretic rewards, the pity-timer, and the live coin economy.</span>
          </div>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>

        <div style={{ display: "grid", gap: 10 }}>
          <Link className="primary-btn" href="/">
            Start voting
          </Link>
          <Link className="secondary-btn" href="/daily">
            Try daily challenge
          </Link>
        </div>
      </section>
    </AppChrome>
  );
}
