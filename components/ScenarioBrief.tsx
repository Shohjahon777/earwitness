"use client";

import { useState } from "react";
import { ChevronDown, Ear, Gauge, Hand, Radio, Waves } from "lucide-react";
import type { Mode } from "@/lib/types";

// Pre-vote guidance per scenario. Neutral by design — it says what to LISTEN FOR, never which
// channel is better. Keyed by scenario id (interrupt | pause | accent | clean); falls back to a
// generic brief for anything unrecognized.
type Brief = {
  tag: string;
  icon: typeof Ear;
  headline: string;
  setup: string;
  listenFor: string[];
};

const BRIEFS: Record<string, Brief> = {
  interrupt: {
    tag: "The barge-in test",
    icon: Hand,
    headline: "The caller cuts in mid-sentence.",
    setup:
      "Half-way through the agent's reply, the caller changes their mind out loud. A real receptionist would stop talking and listen.",
    listenFor: [
      "Does the agent yield the floor — or talk straight over the caller?",
      "How fast does it react once it's interrupted?",
      "After it stops, does it pick the new request back up cleanly?"
    ]
  },
  pause: {
    tag: "The hesitation test",
    icon: Gauge,
    headline: "The caller goes quiet, then hesitates.",
    setup:
      "There's a long pause after the price lands. Good turn-handling leaves space; weak endpointing either rushes to fill the silence or freezes.",
    listenFor: [
      "Does the agent wait out the pause, or jump in too early?",
      "When it does speak, is the timing natural?",
      "Does it answer with context, or just blurt a canned line?"
    ]
  },
  accent: {
    tag: "The noisy-line test",
    icon: Radio,
    headline: "A rough, noisy, accented call.",
    setup:
      "The line is degraded and the caller's accent is strong. This isn't about the prettiest voice — it's about whether the agent actually understood.",
    listenFor: [
      "Ignore the voice quality — does the reply make sense for what was said?",
      "Did the agent mishear and answer the wrong thing?",
      "Does it recover gracefully when the caller clarifies?"
    ]
  },
  clean: {
    tag: "The baseline test",
    icon: Waves,
    headline: "Perfect audio, no curveballs.",
    setup:
      "Nothing is broken here. With easy audio and no interruption, naturalness and timing are all that's left to separate the two.",
    listenFor: [
      "Which one sounds most like a real, well-run call?",
      "Is the pacing human, or a beat too fast / too slow?",
      "Does the phrasing feel natural or scripted?"
    ]
  }
};

const GENERIC: Brief = {
  tag: "Blind test",
  icon: Ear,
  headline: "Two stacks, one situation.",
  setup: "Both clips run the same scripted caller through a different voice-AI stack. Only the agent changes.",
  listenFor: [
    "Judge the whole stack: understanding, response, timing, interruption handling.",
    "A gorgeous voice that talks over the caller should lose."
  ]
};

export function ScenarioBrief({ scenarioId, label, mode }: { scenarioId: string; label: string; mode: Mode }) {
  const [open, setOpen] = useState(false);
  const brief = BRIEFS[scenarioId] ?? GENERIC;
  const Icon = brief.icon;
  const voteLine =
    mode === "golden-ears"
      ? "One of these is a real human. Vote for the clip you think is the person."
      : "Vote for the stack you'd actually want answering your call — not just the prettier voice.";

  return (
    <section className="scenario-brief surface" data-open={open}>
      <button
        type="button"
        className="scenario-brief-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="scenario-brief-ic" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="scenario-brief-titles">
          <span className="scenario-brief-tag">{brief.tag}</span>
          <strong className="font-display">{label}</strong>
        </span>
        <ChevronDown size={18} className="scenario-brief-chev" aria-hidden="true" />
      </button>

      <p className="scenario-brief-setup">{brief.headline} {brief.setup}</p>

      <div className="scenario-brief-body" hidden={!open}>
        <span className="scenario-brief-eyebrow">
          <Ear size={13} aria-hidden="true" /> What to listen for
        </span>
        <ul className="scenario-brief-list">
          {brief.listenFor.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="scenario-brief-vote">{voteLine}</p>
      </div>
    </section>
  );
}
