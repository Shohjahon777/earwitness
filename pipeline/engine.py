"""Simulation engine: renders one (scenario × stack) into a single mixed clip + transcript.

This is the only hard part of the project — it turns interactive turn-taking behavior into a
static file. The caller side is a FIXED actor (same words, same interruption timing across every
stack); only the agent — and crucially how it handles the barge-in — changes per stack. That
sameness is what makes the A/B comparison fair.

Pipeline per clip:
  1. Author the fixed caller track (open utterance + a barge-in interjection at a fixed time).
  2. VAD over the caller track → caller endpoint (drives the agent's response timing).
  3. STT the caller's opening → text.
  4. LLM → agent reply text.
  5. TTS → agent audio.
  6. Turn policy schedules the agent and resolves the barge-in (yield / duck / talk_over).
  7. Mix both sides on one timeline, loudness-normalize to −16 LUFS.
"""

from __future__ import annotations

import os
from types import SimpleNamespace

import numpy as np

import audio
from adapters import llm, stt, tts, vad

# The caller is one fixed actor, identical across every stack.
CALLER_HZ = 126.0
CALLER_JITTER = 0.08
# Fixed, stack-independent moment (after the caller's opening) when the barge-in lands,
# sized to fall inside a normal agent reply so the yield-vs-talk-over contrast is clean.
TYPICAL_AGENT_LEAD_MS = 800

# The caller uses a real (but different) voice from the agent when a key is present, else synth.
# Default caller voice is "Domi" — distinct from the agent's "Rachel". Override with
# ELEVENLABS_CALLER_VOICE_ID. Cached by line so we don't re-bill the same caller across stacks.
_CALLER_CACHE: dict[str, np.ndarray] = {}


def _caller_voice(text: str) -> np.ndarray:
    if not text.strip():
        return np.zeros(0, dtype=np.float32)
    if text in _CALLER_CACHE:
        return _CALLER_CACHE[text].copy()
    profile = SimpleNamespace(
        id="caller",
        tts_provider="elevenlabs" if os.environ.get("ELEVENLABS_API_KEY") else "synth",
        eleven_voice_id=os.environ.get("ELEVENLABS_CALLER_VOICE_ID", "AZnzlk1XvdvUeBnXmlld"),  # Domi
        voice_base_hz=CALLER_HZ,
        voice_jitter=CALLER_JITTER,
    )
    out = tts.synthesize(text, profile)
    _CALLER_CACHE[text] = out
    return out.copy()


def render(scenario, stack) -> tuple[np.ndarray, dict, float]:
    # 1. Fixed caller track ------------------------------------------------
    caller_open = _caller_voice(scenario.caller_open)
    if scenario.noisy:
        caller_open = audio.add_noise(caller_open, snr_db=7.0)
    open_dur = audio.duration_s(caller_open)

    # 2. VAD → caller endpoint --------------------------------------------
    regions = vad.speech_regions(caller_open)
    caller_endpoint = regions[-1][1] if regions else open_dur

    has_interjection = bool(scenario.caller_interjection.strip())
    interject_at = caller_endpoint + TYPICAL_AGENT_LEAD_MS / 1000 + scenario.interject_at_ms / 1000
    interjection = (
        _caller_voice(scenario.caller_interjection)
        if has_interjection else np.zeros(0, dtype=np.float32)
    )
    if scenario.noisy and has_interjection:
        interjection = audio.add_noise(interjection, snr_db=7.0)
    interject_end = interject_at + audio.duration_s(interjection)

    # 3-5. STT → LLM → TTS -------------------------------------------------
    heard = stt.transcribe(caller_open, scenario.caller_open, noisy=scenario.noisy)
    reply_text = llm.reply(scenario, heard, stack)
    agent_audio = tts.synthesize(reply_text, stack)
    agent_start = caller_endpoint + stack.latency_ms / 1000
    agent_end = agent_start + audio.duration_s(agent_audio)

    # 6. Turn policy: resolve the barge-in --------------------------------
    outcome = "no interruption"
    resume_text = ""
    events = []

    overlaps = has_interjection and interject_at < agent_end and interject_end > agent_start
    if overlaps:
        if stack.barge_in == "talk_over":
            outcome = "talked over the caller"
            # agent plays through; both voices overlap at full volume (the bad behavior)
        elif stack.barge_in == "duck":
            outcome = "ducked under the caller"
            agent_audio = _duck(agent_audio, agent_start, interject_at, interject_end, level=0.32)
        else:  # yield
            outcome = "yielded to the caller"
            cut_at = interject_at + stack.reaction_ms / 1000
            agent_audio = _truncate(agent_audio, agent_start, cut_at)
            agent_end = agent_start + audio.duration_s(agent_audio)
            resume_text = scenario.agent_resume

    # 7. Mix ---------------------------------------------------------------
    mix = np.zeros(0, dtype=np.float32)
    mix = audio.overlay(mix, caller_open, 0.0)
    events.append(_ev("caller", 0.0, open_dur, scenario.caller_open))

    mix = audio.overlay(mix, agent_audio, agent_start, gain=0.95)
    events.append(_ev("agent", agent_start, agent_start + audio.duration_s(agent_audio), reply_text))

    if has_interjection:
        mix = audio.overlay(mix, interjection, interject_at)
        events.append(_ev("caller", interject_at, interject_end, scenario.caller_interjection))

    if resume_text:
        resume_audio = tts.synthesize(resume_text, stack)
        resume_at = interject_end + 0.25
        mix = audio.overlay(mix, resume_audio, resume_at, gain=0.95)
        events.append(_ev("agent", resume_at, resume_at + audio.duration_s(resume_audio), resume_text))

    mix = audio.loudness_normalize(mix, target_lufs=-16.0)
    dur = audio.duration_s(mix)

    transcript = {
        "scenarioId": scenario.id,
        "scenarioType": scenario.type,
        "stackId": stack.id,
        "stackName": stack.name,
        "isHuman": stack.is_human,
        "insight": scenario.insight,
        "bargeIn": stack.barge_in,
        "outcome": outcome,
        "interruptionAt": round(interject_at, 3) if has_interjection else None,
        "events": sorted(events, key=lambda e: e["start"]),
    }
    return mix, transcript, dur


def _ev(speaker: str, start: float, end: float, text: str) -> dict:
    return {"speaker": speaker, "start": round(start, 3), "end": round(end, 3), "text": text}


def _truncate(agent: np.ndarray, agent_start: float, cut_at: float) -> np.ndarray:
    """Yield: stop the agent shortly after the barge-in, with a quick fade."""
    keep = int((cut_at - agent_start) * audio.SR)
    keep = max(0, min(keep, len(agent)))
    out = agent[:keep].copy()
    fade = min(int(0.06 * audio.SR), len(out))
    if fade:
        out[-fade:] *= np.linspace(1, 0, fade)
    return out


def _duck(agent: np.ndarray, agent_start: float, t0: float, t1: float, level: float) -> np.ndarray:
    """Duck: lower the agent's volume while the caller speaks, then recover."""
    out = agent.copy()
    s = int((t0 - agent_start) * audio.SR)
    e = int((t1 - agent_start) * audio.SR)
    s, e = max(0, s), min(len(out), e)
    if e > s:
        out[s:e] *= level
    return out
