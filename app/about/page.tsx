import type { Metadata } from "next";
import Link from "next/link";
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
