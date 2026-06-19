# Earwitness offline pipeline

Renders the `(scenario × stack)` clip library that the web app serves. The web app does **zero**
inference at vote time — it only plays these pre-rendered clips. The hard part is the
**simulation engine** ([engine.py](engine.py)): it turns interactive turn-taking into a static
mixed file, with a **fixed caller** (same words + interruption timing across every stack) so the
A/B comparison is fair, and only the agent's behavior — especially barge-in handling — varies.

## Quick start

```bash
cd pipeline
python -m venv .venv && . .venv/Scripts/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python run.py proof     # the make-or-break artifact (interruption: yield vs talk-over)
python run.py all       # full matrix → out/manifest.json
```

Then from the repo root, upload + seed:

```bash
npm run db:push
npm run db:seed         # uploads out/*.wav to Vercel Blob (or public/clips) + writes Postgres
```

## How a clip is rendered

1. **Fixed caller track** — opening utterance + a barge-in interjection at a fixed, stack-
   independent time.
2. **VAD** ([adapters/vad.py](adapters/vad.py)) → caller endpoint (drives the agent's response timing).
3. **STT** ([adapters/stt.py](adapters/stt.py)) → caller text.
4. **LLM** ([adapters/llm.py](adapters/llm.py)) → agent reply.
5. **TTS** ([adapters/tts.py](adapters/tts.py)) → agent audio.
6. **Turn policy** ([engine.py](engine.py)) — schedules the agent and resolves the barge-in:
   `yield` (stop + resume), `duck` (lower under the caller), or `talk_over` (plow on).
7. **Mix** both sides on one timeline, loudness-normalize to −16 LUFS so no clip wins on volume.

## Providers (hybrid)

Every adapter degrades to a local fallback, so the pipeline renders with **no keys**:

| Stage | Real (when configured)                | Fallback                         |
|-------|----------------------------------------|----------------------------------|
| LLM   | Vercel AI Gateway (`AI_GATEWAY_API_KEY`, default `anthropic/claude-opus-4-8`) | scenario's canned reply |
| TTS   | ElevenLabs (`ELEVENLABS_API_KEY`) · Piper (`PIPER_MODEL`) | numpy voice synth          |
| STT   | faster-whisper (`pip install faster-whisper`) | authored caller transcript |
| VAD   | Silero (`pip install silero-vad torch`)       | energy VAD                       |

The `premium` stack is wired for the real premium path (ElevenLabs + Claude); `local` targets
Piper. The contrast that matters most — **yield vs talk-over** — lives in the turn scheduling and
is fully audible even on the synth fallback.

> Encoding: clips are written as WAV (no ffmpeg needed). Swap to Opus in `audio.write_wav` /
> `seed.ts` when ffmpeg/libopus is available.
