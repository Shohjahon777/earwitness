# The Earwitness simulation engine

How a deployable voice-AI **stack** (STT + LLM + TTS + turn-handling) gets turned into a single,
cached audio clip that anyone can blind-test. This document explains every moving part so the
whole thing can be read end to end.

---

## 1. Two worlds, joined only by a cache

```
OFFLINE (runs once, here in pipeline/)          ONLINE (the web app, per request)
scenario × stack  ─► simulation engine ─► clip + transcript ─► R2/Blob ─► serve A/B ─► vote ─► rank
```

All the models live **offline**. The website never calls a voice API — it just serves pre-rendered
clips. That's why voting is free for the user and ~$0/month to run, no matter how viral it goes.

## 2. The one mental model

Every clip is a **two-party phone call** with exactly **two voices**:

| Voice | Who | Changes per stack? |
|-------|-----|--------------------|
| **Caller** | A fixed actor (ElevenLabs "Domi"), authored once | ❌ identical in every clip |
| **Agent** | The stack under test | ✅ different voice + behavior per stack |

The caller is a **constant**; the stack is the **variable**. That sameness is the entire reason an
A/B comparison is fair. The caller is deliberately a different person from every agent so a listener
can always tell who is the customer and who is the AI.

> You can't judge "turns, interruptions, and pauses" with a single monologue — interruption needs
> two parties. A monologue would only test the voice (TTS), which is exactly what Vapi's Humanness
> Index does. The dialogue format is what lets us test the **whole** stack.

## 3. The render pipeline

Everything happens in [`engine.py`](engine.py) → `render(scenario, stack)`. The seven steps, mapped
to the four stack components Bek asked us to judge:

| # | Step | Component | File |
|---|------|-----------|------|
| 1 | Author the fixed caller track (+ noise for the accent scenario) | — | `engine._caller_voice`, `audio.add_noise` |
| 2 | Find where the caller stops talking (the "endpoint") | **turn-handling** | [`adapters/vad.py`](adapters/vad.py) |
| 3 | Transcribe the caller's speech → text | **STT** | [`adapters/stt.py`](adapters/stt.py) |
| 4 | Generate the agent's reply from that text | **LLM** | [`adapters/llm.py`](adapters/llm.py) |
| 5 | Speak the reply in the stack's voice | **TTS** | [`adapters/tts.py`](adapters/tts.py) |
| 6 | Schedule the agent + resolve the interruption | **turn-handling** | `engine.render` |
| 7 | Mix both voices on one timeline, loudness-normalize, encode | — | [`audio.py`](audio.py) |

## 4. Turn handling + interrupts (the core)

This is the only hard part — turning *interactive* behavior into a *static* file.

**Response latency.** The agent starts replying at:

```
agent_start = caller_endpoint + stack.latency_ms
```

So a slow stack (e.g. Local-baseline at 900 ms) audibly lags; a snappy one replies almost
immediately. Latency is a per-stack knob.

**The barge-in.** The caller's interruption is scheduled at a fixed moment (sized to land *inside* a
normal agent reply, via `TYPICAL_AGENT_LEAD_MS`). If it overlaps the agent's speech, the stack's
`barge_in` policy decides what you hear:

| Policy | What happens | Rendered by | Who uses it |
|--------|--------------|-------------|-------------|
| `yield` | Agent truncates with a quick fade, then resumes after the caller | `engine._truncate` | Premium, Fast/cheap, Local, Human |
| `duck`  | Agent lowers its volume while the caller speaks, then recovers | `engine._duck` | Robust |
| `talk_over` | Agent plows on at full volume over the caller | (no change) | **Pretty-but-rude** (engineered to lose) |

The amount of caller/agent overlap is the measurable signal: a `yield` overlaps ~0.2 s, a
`talk_over` overlaps ~2 s. That contrast is the product thesis in one number.

## 5. The stacks (the matrix rows × columns)

Six stacks ([`config.py`](config.py)), chosen to differ by **purpose**, not brand:

| Stack | barge-in | latency | Point it proves |
|-------|----------|---------|-----------------|
| Premium | yield | 420 ms | The expected winner — clean everything |
| Fast/cheap | yield | 250 ms | Fast but aggressive endpointing |
| **Pretty-but-rude** | **talk_over** | 500 ms | Gorgeous voice that interrupts you → should lose |
| Robust | duck | 520 ms | Careful recovery, tuned for the noisy case |
| Local-baseline | yield | 900 ms | Cost-vs-quality: real voice, but slow |
| Human | yield | 650 ms | A real person (golden-ears mode) |

Four scenarios each exercise a different weakness: **interrupt** (turn-handling), **pause**
(endpointing), **accent** (STT robustness), **clean** (naturalness). 6 × 4 = 24 clips.

## 6. Hybrid adapters: real models, graceful fallback

Every adapter tries a **real** model first and falls back so the pipeline *always* renders:

| Adapter | Real path | Fallback |
|---------|-----------|----------|
| VAD | Silero (needs `torch`) | energy-based VAD in `audio.py` |
| STT | faster-whisper | the authored caller text (ground truth is known) |
| LLM | Vercel AI Gateway, per-stack `llm_model` | a scripted per-scenario reply |
| TTS | ElevenLabs (per-stack `eleven_voice_id`) | numpy voice-synth tuned by pitch/jitter |

This means the engine runs on a laptop with zero API keys (synthetic but turn-accurate), and
upgrades to fully real audio the moment keys are present.

## 7. Loudness fairness

If one clip is louder, listeners pick it regardless of quality — so **no clip may win on volume**.
`audio.loudness_normalize` targets −16 LUFS per clip (pyloudnorm if installed, else a gated-RMS
approximation), and `loudness_match.py` re-matches the whole rendered set to one gated target with a
tanh soft-limiter. The 24 clips end within ~0.7 dB of each other.

## 8. Running it

```bash
cd pipeline
python run.py proof    # the make-or-break 2 clips: yield vs talk-over on the interrupt scenario
python run.py all      # the full 6×4 matrix → out/*.wav + out/*.json + out/manifest.json
python loudness_match.py   # equalize loudness across the rendered set
```

Then, from the repo root, publish them:

```bash
npm run db:push        # sync the Postgres schema
npm run db:seed        # upload clips to Vercel Blob + write rows from manifest.json
```

Provider keys live in `.env` (`ELEVENLABS_API_KEY`, `AI_GATEWAY_API_KEY`); `run.py` loads them
automatically. Without them, every stack uses the synth/scripted fallbacks.

## 9. What each clip emits

- **`{scenario}__{stack}.wav`** — the mixed two-party call the voter hears.
- **`{scenario}__{stack}.json`** — the transcript/timeline: every turn (speaker, start, end, text),
  the barge-in `outcome`, and the interruption time. The web app shows the speaker/timing/text as
  live captions (safe pre-vote) and the `outcome` only at the reveal.
- **`manifest.json`** — the index the seed script reads to populate Blob + Postgres.
