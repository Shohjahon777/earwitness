# Earwitness — UI Build Spec

> Working title: **Earwitness** (placeholder — swap freely). A public, no-login web app where anyone blind-tests and votes on voice-AI *stacks* (not single voices), and can test their own ear against real humans.

---

## 0. Roles & ownership

- **Principal engineer (spec):** defines product, screens, states, design system, API contracts (this doc).
- **Frontend dev (you, the generating agent):** build the entire UI in Next.js against the **mock data layer** defined in §8. Every screen, every state, fully responsive, mobile-first. Do **not** build the audio pipeline or real backend — code against typed stubs with realistic fixtures.
- **Fullstack/ML eng (Claude Code, later):** replaces the stubbed API client with real endpoints and ships the offline clip-generation pipeline. Leave clean seams: one typed `api` module, no fetch calls scattered in components.

**Hard product constraints (these shape the UI, do not violate):**
1. No login wall, no paywall. Anonymous session via cookie.
2. Must work one-handed on a phone. Mobile is the primary target, desktop is the adaptation.
3. Audio is **pre-generated and cached** — the UI streams short static clips from a CDN. There is **no live inference**. Treat clips as plain audio URLs.
4. The thing being ranked is a **deployable stack** (STT + LLM + TTS + turn-handling), never a single voice. The UI must reinforce this everywhere it labels things.

---

## 1. What the user does (core loop)

1. Lands directly in a round — two anonymized clips, **A** and **B**, of the same scripted conversation rendered through two different stacks.
2. Listens to both (must play both before voting — enforced in UI).
3. Votes for the better **agent**, or in Golden-ears mode, guesses which is the **human**.
4. Sees an instant **reveal**: what each clip actually was, plus a one-line "why this matters" note tied to the scenario.
5. Their running stats update (accuracy, streak), then **Next round** — no friction, no page reload.

Voting is the product. Everything else (leaderboard, daily challenge, sharing) hangs off this loop.

---

## 2. Screens

### 2.1 Arena (default landing, `/`)
The voting screen. This is 80% of the product — make it excellent.

```
┌─────────────────────────────────┐
│  EARWITNESS        ◐ Arena ▾  ⓘ │  ← top bar: mode switch + info
├─────────────────────────────────┤
│  Scenario: "Customer interrupts" │  ← scenario chip (neutral, no spoilers)
│                                  │
│   ╭───────── A ─────────╮        │  ← Channel A card (cool/blue)
│   │  ▁▃▅▇▅▃▁▃▅▇▅▃  ▶    │        │     mirrored waveform + play
│   │  0:00 ──────── 0:14 │        │
│   ╰─────────────────────╯        │
│                                  │
│         ⟂ which is better?       │  ← center balance indicator
│                                  │
│   ╭───────── B ─────────╮        │  ← Channel B card (warm/coral)
│   │  ▁▃▅▇▅▃▁▃▅▇▅▃  ▶    │        │
│   │  0:00 ──────── 0:16 │        │
│   ╰─────────────────────╯        │
│                                  │
│   [   Vote A   ]  [   Vote B   ] │  ← sticky vote bar (thumb zone)
│         · · ·  tie               │  ← optional tie/"both bad"
└─────────────────────────────────┘
```

States:
- **Loading** — skeleton waveforms shimmer; vote bar disabled.
- **Idle** — both clips loaded, neither played. Vote bar disabled with hint "Listen to both to vote".
- **Playing A / Playing B** — playhead sweeps the active card; the other card dims slightly. Only one plays at a time (pause the other on play).
- **Ready to vote** — both played at least once → vote bar enabled, center indicator pulses subtly.
- **Voted → Revealing** — chosen card animates toward center (the balance "tips"); 250ms later the **Reveal panel** (§2.2) slides up.
- **Error** — clip failed to load: replace that card with a retry state ("Couldn't load this clip. Retry") and disable voting until resolved. Errors give direction, never apologize.

### 2.2 Reveal panel (overlay on Arena, post-vote)
- Each clip flips to show its **stack identity**: e.g. `Deepgram · GPT-4o · ElevenLabs · barge-in: yes`. Render the stack as four labeled chips (STT / LLM / TTS / turns) so the "it's a stack" point is visual, not textual.
- One-line scenario insight tuned to what was tested, e.g. _"B had the nicer voice but talked over the customer — good agents yield."_
- If the user's pick matches the crowd-leading stack, a small affirmation; if not, neutral ("Most listeners disagreed — here's why this is close"). Never scold.
- Primary action: **Next round**. Secondary: **Share this matchup** (→ share card, §2.6).

### 2.3 Golden-ears mode (`/golden-ears`, also reachable via mode switch)
Same voting frame, different question and reveal. One clip is a **real human** agent doing the same scenario; one is AI. Prompt: **"Which one is the human?"** Reveal shows correct/incorrect, updates the user's **accuracy %** and **streak**. This mode powers the addictive hook and the daily challenge.

States mirror Arena, plus:
- **Correct** — streak flame grows, accuracy ticks up with a count-up animation.
- **Incorrect** — streak resets to 0 with a soft break animation; show the tell ("The human paused to think at 0:06").

### 2.4 Daily challenge (`/daily`)
A fixed 5-round golden-ears set, identical for everyone that day → comparable scores → the share engine.
- Top: progress dots `● ● ○ ○ ○` and round counter.
- Each round is a golden-ears round (reuse the component).
- After round 5: **Results screen** — score `4/5`, today's percentile ("better than 78% of listeners"), streak status, and a big **Share card** CTA + **Challenge a friend** link.
- If already completed today: show the results screen directly with a "Come back tomorrow" state and a countdown to reset.

### 2.5 Leaderboard (`/leaderboard`)
Two tabs: **Stacks** and **Listeners**.

**Stacks tab** — the headline differentiator. A ranked table with sub-rating tabs:
- Dimension tabs: **Overall · Naturalness · Interaction handling**. (Interaction handling is driven only by interruption/pause scenarios — this is the proof we rank stacks, not voices.)
- Each row: rank, stack name + the four config chips, rating with a confidence interval (e.g. `1182 ±14`), number of votes, and a sparkline trend. Sort by selected dimension.
- A stack with the best naturalness but poor interaction handling should be visibly split across tabs — make that legible.

**Listeners tab** — anonymous handles (auto-generated, e.g. "Listener-7F2"), golden-ears accuracy, longest streak, daily-challenge score. The current user's row is pinned and highlighted.

### 2.6 Share card (`/c/[id]` + dynamic OG image)
- A visually strong, screenshot-ready card: the user's golden-ears accuracy or daily score, a tagline ("I've got golden ears — 87% AI-detection"), and a **Can you beat it?** CTA linking back to the daily challenge.
- This route also backs the **dynamic OG image** (server-rendered) so links unfurl richly in Telegram/Twitter. Build the visual card component such that it can render both in-page and as the OG image source.

### 2.7 How it works (`/about`, lightweight)
Two short paragraphs + a diagram slot: what a "stack" is, and why a cached clip can still test interruption/pauses. Keep it skimmable; this is not a docs site.

---

## 3. Component inventory

Build these as reusable, prop-driven components. Names are suggestions.

| Component | Responsibility | Key props / states |
|---|---|---|
| `ModeSwitcher` | Toggle Arena / Golden-ears | `mode`, `onChange` |
| `ScenarioChip` | Neutral scenario label, no spoilers | `label` |
| `ClipCard` | One channel (A or B): waveform, play/pause, timeline, dim/active/error states | `channel: 'A'|'B'`, `clip`, `state`, `onPlay`, `onEnded` |
| `WaveformPlayer` | Renders waveform + sweeping playhead (WaveSurfer.js or canvas) | `src`, `color`, `playing`, `onProgress` |
| `BalanceIndicator` | Center "which is better?" element that tips toward the vote | `tilt: -1..1`, `pulsing` |
| `VoteBar` | Sticky thumb-zone actions (Vote A / Vote B / tie) | `enabled`, `onVote` |
| `RevealPanel` | Post-vote identity flip + insight + next | `clipA`, `clipB`, `userPick`, `insight`, `onNext`, `onShare` |
| `StackChips` | The four config chips (STT/LLM/TTS/turns) | `stack` |
| `RoundProgress` | Daily-challenge dots + counter | `current`, `total` |
| `ScorePill` | Accuracy %, count-up | `value`, `delta` |
| `StreakFlame` | Streak counter with grow/break animation | `count`, `event: 'grow'|'break'` |
| `LeaderboardTable` | Sortable rows, dimension tabs, pinned user row | `dimension`, `rows`, `currentUserId` |
| `DimensionTabs` | Overall / Naturalness / Interaction | `value`, `onChange` |
| `ShareCard` | Screenshot-ready result, also OG source | `variant: 'page'|'og'`, `stats` |
| `SessionStats` | Persistent mini HUD: accuracy + streak | `accuracy`, `streak` |
| `Toast` | Non-blocking feedback | `message`, `tone` |

---

## 4. Design system

**Direction — "blind audition booth."** Broadcast/VU-meter world: two contestants, two channels, a live signal. The personality lives in the **dual-channel waveform comparator** (A above, B below, meeting at a center line) and in data rendered as instrument readouts. Spend the boldness there; keep everything else quiet. Deliberately *not* the generic dark-bg-plus-one-neon-accent look — there are two channel colors plus a signal accent, and data uses a mono face for an oscilloscope feel.

### Color tokens
```
--ink:        #14131A   /* warm near-black base, faint purple */
--surface:    #1E1C26   /* cards */
--surface-2:  #272430   /* raised / hover */
--channel-a:  #3DA9FC   /* A = cool signal blue */
--channel-b:  #FF715B   /* B = warm signal coral */
--signal:     #FFC94D   /* VU amber: live, scores, streaks, CTAs */
--human:      #5DCAA5   /* teal: the "real human" reveal */
--text:       #F2F0EA
--text-muted: #9A98A4
--line:       rgba(242,240,234,0.10)
```
A and B are **always** blue and coral respectively — never swap, it's how users track channels. Amber is reserved for "live/score/action" so it stays meaningful. Teal appears only in golden-ears reveals. All must pass contrast on `--ink`/`--surface`.

### Typography
- **Display:** Space Grotesk (headlines, scenario, scores) — technical, slightly mechanical.
- **Body:** Inter (UI copy).
- **Data/mono:** JetBrains Mono (clip timers, ratings, IDs, config chips) — carries the instrument feel.
- Sentence case everywhere. Two weights: 400 and 500/600 for emphasis only.

### Motion (respect `prefers-reduced-motion`)
- Waveforms **draw in** on load (left→right, ~400ms).
- Playhead sweeps in real time; active card lifts, inactive dims to ~60%.
- Vote → `BalanceIndicator` tips toward the pick (~200ms), winning card nudges to center, then `RevealPanel` slides up.
- Golden-ears: correct → flame scales up + score count-up; incorrect → flame breaks (quick shake + reset).
- Keep it orchestrated and few — over-animation reads as AI-generated. One satisfying vote moment beats five scattered effects.

### Mobile rules
- Vote actions live in a **sticky bottom bar**, full-width, ≥48px tall, thumb-reachable.
- Tap-to-play (mobile autoplay is blocked — never attempt autoplay; the first tap starts audio).
- Single column; the two clip cards stack vertically with the balance indicator between them — this *is* the mirrored-channel layout on mobile.
- No hover-dependent affordances; everything works on tap.

---

## 5. Empty / loading / error states (write these, don't skip)

- **No rounds available:** "No matchups right now. Check the leaderboard while we cook more." → link to leaderboard.
- **Clip load failure:** inline retry on the affected card; never block the whole screen if only one clip fails.
- **Daily already done:** results + countdown to next reset.
- **Leaderboard empty (cold start):** "Voting just opened. Be the first to rank a stack."
- **Offline:** banner "You're offline — votes will send when you reconnect" (queue locally; Claude Code wires real persistence).

Copy voice: plain, active, direction-giving. Errors explain what happened and the fix. Empty screens invite an action.

---

## 6. Accessibility & quality floor

- Keyboard: `A`/`B` play respective clips, `1`/`2` vote, `Enter` next. Visible focus rings.
- Each `WaveformPlayer` has an accessible label and exposes play state to screen readers; provide a text duration.
- Color is never the only signal — A/B also carry the letter and position (top/bottom).
- Targets ≥44px; contrast AA; `prefers-reduced-motion` disables sweeps/flips (snap instead).

---

## 7. Routes summary

| Route | Screen |
|---|---|
| `/` | Arena (default round loop) |
| `/golden-ears` | Golden-ears round loop |
| `/daily` | Daily challenge (5 rounds → results) |
| `/leaderboard` | Stacks + Listeners tabs |
| `/c/[id]` | Share card page (+ OG image endpoint) |
| `/about` | How it works |

---

## 8. Mock data layer (build against this; Claude Code swaps in real endpoints)

Put everything in `lib/api.ts` exporting typed async functions. Back them with in-memory fixtures + artificial latency so all loading/error states are reachable via a `?mock=` flag or env toggle. **No component calls `fetch` directly.**

### Types
```ts
type Channel = 'A' | 'B';
type Mode = 'arena' | 'golden-ears';

interface StackConfig {
  id: string;
  name: string;          // e.g. "Premium"
  stt: string;           // "Deepgram"
  llm: string;           // "GPT-4o"
  tts: string;           // "ElevenLabs"
  turns: string;         // "barge-in: yes"
  isHuman?: boolean;     // golden-ears only
}

interface Clip {
  id: string;
  url: string;           // cached audio (mp3/opus)
  durationSec: number;
  stack: StackConfig;    // hidden from UI until reveal
}

interface Round {
  id: string;
  mode: Mode;
  scenario: { id: string; label: string; insight: string }; // insight shown at reveal
  clipA: Clip;
  clipB: Clip;
}

interface VoteResult {
  recorded: boolean;
  winnerChannel: Channel | 'tie';
  correct?: boolean;     // golden-ears: did they pick the human
  reveal: { A: StackConfig; B: StackConfig; insight: string };
  session: { accuracy: number; streak: number; votes: number };
}

interface LeaderboardRow {
  rank: number;
  stack: StackConfig;
  rating: number;
  ratingCI: number;      // ± confidence interval (Bradley–Terry)
  votes: number;
  trend: number[];       // sparkline
}

interface Me {
  sessionId: string;
  handle: string;        // "Listener-7F2"
  accuracy: number;
  streak: number;
  votes: number;
  dailyDone: boolean;
}
```

### Functions
```ts
getRound(mode: Mode): Promise<Round>
submitVote(roundId: string, pick: Channel | 'tie'): Promise<VoteResult>
getDaily(): Promise<{ rounds: Round[]; alreadyDone: boolean; resetsAt: string }>
submitDaily(answers): Promise<{ score: number; percentile: number; shareId: string }>
getLeaderboard(dim: 'overall'|'naturalness'|'interaction'): Promise<LeaderboardRow[]>
getListeners(): Promise<Me[]>
getMe(): Promise<Me>
getShareCard(id: string): Promise<{ stats; tagline: string }>
```

Fixtures: ~6 stacks (Premium, Fast/cheap, Pretty-but-rude, Robust, Local-baseline, + one human for golden-ears), ~4 scenarios (interruption, long-pause, noisy/accented, clean). Provide 2–3 real short audio files (any placeholder voice clips) so the waveform/player is exercised end-to-end.

---

## 9. Tech stack (frontend)

- Next.js (App Router) + TypeScript, Tailwind.
- WaveSurfer.js (or a small canvas renderer) for waveforms.
- `@vercel/og` for the dynamic share image.
- State: local component state + a light store (Zustand or context) for session stats. No heavy global state.
- Deploy target: Vercel. Cheap to run — static-first, no per-vote server compute beyond a write.

---

## 10. Definition of done (UI)

- Full Arena loop works against mocks: load → play both → vote → reveal → next, with every state reachable.
- Golden-ears loop with accuracy + streak.
- Daily challenge: 5 rounds → results → share card + OG image renders.
- Leaderboard with all three stack dimensions + listeners tab, user row pinned.
- Fully responsive, one-handed on mobile, keyboard accessible, reduced-motion honored.
- Zero direct `fetch` in components; all data through `lib/api.ts`.