# Earwitness — project context for Claude Code

Working title: **Earwitness** (placeholder, changeable). A public, no-login web app where anyone blind-tests and votes on voice-AI **stacks** (not single voices), and can test their own ear against real humans. This is a portfolio/trial project for a voice-AI company (Speko, YC). It must look and run like a real product.

---

## The one idea everything hangs on

The thing being ranked is a **deployable stack** = `STT + LLM + TTS + turn-handling`, never a single TTS voice. A config with the prettiest voice that talks over the caller should **lose**. This is what separates it from Vapi's Humanness Index (which compares single voices). Reinforce it everywhere the UI labels things.

## The mental model that resolves all the confusion

There are **two different "users"** — keep them separate at all times:

1. **The voter** (person on the website) = a **judge**. They never speak, never use a microphone, never send audio. They put on headphones, hear two pre-rendered clips (A and B), and tap one. Think blind taste test: we hand them two cups we poured earlier; they sip and point. This is why caching works — and why there is **no live inference and no mic input** anywhere in the app.

2. **The caller** (the voice *inside* the recording, talking to the agent) = a **fixed actor we author once**. Same caller, same words, same interruption timing, identical across every stack. That sameness is what makes the comparison fair.

If anyone ever proposes a microphone, live STT/TTS at vote time, or per-user audio, that's a design violation — stop and reconsider.

## What we cache (this was the main point of confusion — settle it)

We cache **both audio and transcript, bundled per `(scenario × stack)`**, doing different jobs:

- **Audio** — a fully rendered recording of one complete two-party conversation (the fixed caller + the agent as produced by ONE stack), mixed to a single short file (Opus). This is what the voter hears.
- **Transcript + timeline JSON** — metadata for the post-vote reveal: who said what, when each side spoke, where the interruption landed, which stack it was, and a one-line insight. The voter never hears this; it's shown after they vote.

### One clip's lifecycle (concrete)
1. Author ONE scenario, e.g. "customer interrupts." Record/TTS the **caller side once** (e.g. interruption at the 4s mark). This caller audio is now frozen and reused for every stack.
2. Run that frozen caller audio through Stack A → render Stack A's agent response + interruption handling, mix with caller audio → `clip_interrupt_stackA.opus` + transcript JSON. Cache in R2.
3. Same for Stack B … through all ~6 stacks. Now this scenario has ~6 cached clips.
4. **At vote time the app does ZERO generation** — it picks a scenario, picks two of its cached clips, serves them as A/B. Randomize which two stacks and which scenario per round; 6 stacks × 4 scenarios gives plenty of pairings.

## Hard product constraints

- No login wall, no paywall. Anonymous session via cookie.
- Mobile-first, must work one-handed on a phone. Tap-to-play (never autoplay).
- Audio is pre-generated/cached static files on a CDN. No live inference, ever.
- Free for the user, cheap to run.

---

## Architecture: two worlds joined only by the cache

**Offline (runs once, where all models live):**
`scenario × stack matrix → simulation engine → cached clips + metadata`

The **simulation engine** is the only hard part. It renders interactive behavior into a static file:
1. Silero VAD over the fixed caller track → marks speech/silence (drives endpointing; each stack has its own silence threshold).
2. On endpoint → STT (faster-whisper local, or provider) transcribes the caller segment.
3. Transcript → LLM generates the agent reply.
4. Reply → TTS synthesizes agent audio.
5. **Turn policy** schedules it: response latency + barge-in handling. When the caller's scripted interruption lands while the agent is talking, a good stack ducks/stops, a bad one plows on. This is a config flag → different rendered output per stack.
6. Mix caller + agent on one timeline (ffmpeg/pydub), **loudness-normalize to −16 LUFS (pyloudnorm)** so no clip wins on volume alone, encode to Opus. Emit clip + transcript/timeline JSON.

**Online (per request, cheap CRUD):**
`web app → serve cached clip pair → blind vote → ranking → leaderboard + share cards`

## Stacks to render (pick ~6 that differ by purpose, not brand)
- Premium — Deepgram + GPT-4o + ElevenLabs + clean barge-in (expected top)
- Fast/cheap — faster-whisper + Llama-3 (Groq) + Deepgram Aura + aggressive endpointing
- Pretty-but-rude — ElevenLabs (gorgeous) + NO barge-in (engineered to lose; this is the thesis)
- Robust — Whisper-large + light denoise + decent TTS (tuned for noisy/accented scenario)
- Local baseline — Whisper + open LLM + Piper/Kokoro (cost-vs-quality point)
- (Golden-ears) a real human recording of the same scenarios

## Scenarios (each exercises the full stack)
interruption · long pause/hesitation (tests endpointing) · noisy/accented input (tests STT via whether the reply makes sense) · clean baseline (TTS naturalness + LLM quality).

## Ranking
- **Bradley–Terry** for the published leaderboard (gives confidence intervals so low-vote stacks don't outrank well-tested ones).
- Streaming **Elo** for the live number the voter sees tick after voting.
- Tag each vote with its scenario type → publish a multi-dimensional leaderboard: **Overall · Naturalness · Interaction handling** (interaction driven only by interruption/pause scenarios). This is the clearest proof we rank stacks, not voices.
- Only count a vote if the session actually played both clips through (cheap anti-bot).

## Game + viral mechanics
- **Arena mode:** AI-vs-AI, "which agent is better?" → feeds leaderboard.
- **Golden-ears mode:** human-vs-AI, "which is the human?" → personal accuracy %, streaks; needs a few real human recordings mixed in.
- **Daily challenge:** fixed 5 golden-ears rounds, same for everyone → comparable scores → leaderboard + sharing.
- **Share card:** server-rendered dynamic OG image (@vercel/og) so links unfurl richly in Telegram/Twitter; "Can you beat it?" back to the daily.

---

## Tech stack
- Frontend: Next.js (App Router) + TypeScript + Tailwind; WaveSurfer.js for waveforms; @vercel/og for share images; light store (Zustand/context) for session stats.
- Backend: Next.js route handlers; Postgres (Neon) via Prisma; clips on Cloudflare R2.
- Offline pipeline: Python — Silero VAD, faster-whisper, provider/open LLMs, ElevenLabs/Cartesia/OpenAI/Piper TTS, ffmpeg/pydub + pyloudnorm.
- Deploy: Vercel.

## Data contracts (UI codes against `lib/api.ts`; no raw fetch in components)
```ts
type Channel = 'A' | 'B';
type Mode = 'arena' | 'golden-ears';
interface StackConfig { id:string; name:string; stt:string; llm:string; tts:string; turns:string; isHuman?:boolean }
interface Clip { id:string; url:string; durationSec:number; stack:StackConfig }   // stack hidden until reveal
interface Round { id:string; mode:Mode; scenario:{id:string;label:string;insight:string}; clipA:Clip; clipB:Clip }
interface VoteResult { recorded:boolean; winnerChannel:Channel|'tie'; correct?:boolean;
  reveal:{A:StackConfig;B:StackConfig;insight:string}; session:{accuracy:number;streak:number;votes:number} }
interface LeaderboardRow { rank:number; stack:StackConfig; rating:number; ratingCI:number; votes:number; trend:number[] }
interface Me { sessionId:string; handle:string; accuracy:number; streak:number; votes:number; dailyDone:boolean }
```
Functions: `getRound(mode)`, `submitVote(roundId, pick)`, `getDaily()`, `submitDaily(answers)`, `getLeaderboard(dim)`, `getListeners()`, `getMe()`, `getShareCard(id)`.

## Routes
`/` Arena · `/golden-ears` · `/daily` · `/leaderboard` · `/c/[id]` share+OG · `/about`

## Design language (don't ship the default "dark bg + one neon accent" look)
"Blind audition booth." Signature = dual-channel waveform comparator (A above, B below, meeting at a center line). Data rendered in mono face for an instrument feel.
Tokens: `--ink #14131A`, `--surface #1E1C26`, `--channel-a #3DA9FC` (always A/blue), `--channel-b #FF715B` (always B/coral), `--signal #FFC94D` (live/scores/CTAs), `--human #5DCAA5` (golden-ears reveal only), `--text #F2F0EA`.
Type: Space Grotesk (display), Inter (body), JetBrains Mono (data/timers/IDs). Sentence case. Respect `prefers-reduced-motion`. Targets ≥44px, sticky bottom vote bar in the thumb zone.

## Cost posture (a feature, state it in the demo)
All inference is one-time/offline → recurring cost ≈ $0/month inside free tiers (Vercel Hobby, Neon free, R2 zero-egress). The naive per-vote-live-API version would cost hundreds/month; caching is what makes it ~$0. R2's zero egress means viral traffic doesn't change the bill.

---

## Build order (suggested)
1. **Prove the engine first:** a throwaway Python script that renders TWO good clips for the *interruption* scenario — one stack that yields, one that talks over the caller. If this artifact isn't convincing, nothing else matters.
2. Frontend against mocked `lib/api.ts` (fixtures + artificial latency so all loading/error/empty states are reachable). Build the **Arena loop** first (load → play both → vote → reveal → next), then golden-ears, daily, leaderboard, share.
3. Real backend: Prisma schema, vote write, Bradley–Terry/Elo job, R2 serving. Swap the stubs in `lib/api.ts`.
4. Generate the full clip library (~6 stacks × ~4 scenarios + human recordings), upload to R2, seed the DB.

## Definition of done
Full Arena loop on real data; golden-ears with accuracy/streak; daily → results → share card + OG; leaderboard with 3 stack dimensions + listeners; fully responsive/one-handed/keyboard-accessible/reduced-motion; zero live inference; recurring cost ≈ $0.