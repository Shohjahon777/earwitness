"""TTS adapter. Real ElevenLabs (premium path) + Piper (local) when available, else a
numpy synth so the engine always renders.

ElevenLabs is requested as raw PCM (output_format=pcm_24000) so we can decode without ffmpeg.
"""

from __future__ import annotations

import os
import numpy as np

from audio import SR, synth_utterance


def synthesize(text: str, stack) -> np.ndarray:
    if not text.strip():
        return np.zeros(0, dtype=np.float32)

    provider = getattr(stack, "tts_provider", "synth")
    if provider == "elevenlabs":
        got = _elevenlabs(text, getattr(stack, "eleven_voice_id", None))
        if got is not None:
            return got
        print(f"  [tts] {stack.id}: ElevenLabs unavailable (no/invalid ELEVENLABS_API_KEY) → synth")
    elif provider == "piper":
        got = _piper(text)
        if got is not None:
            return got
        print(f"  [tts] {stack.id}: Piper unavailable → synth")

    # Fallback: voice-ish synth tuned by the stack's pitch/jitter.
    return synth_utterance(text, stack.voice_base_hz, stack.voice_jitter)


def _elevenlabs(text: str, voice_id: str | None = None):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return None
    try:
        import requests

        voice_id = voice_id or os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        resp = requests.post(
            url,
            params={"output_format": "pcm_24000"},
            headers={"xi-api-key": key, "accept": "audio/pcm", "content-type": "application/json"},
            json={"text": text, "model_id": "eleven_turbo_v2_5"},
            timeout=60,
        )
        resp.raise_for_status()
        pcm = np.frombuffer(resp.content, dtype="<i2").astype(np.float32) / 32768.0
        return pcm
    except Exception as exc:  # noqa: BLE001
        print(f"  [tts] elevenlabs failed ({exc}); using synth")
        return None


def _piper(text: str):
    """Piper local TTS via the `piper` CLI if it's on PATH. Returns None if unavailable."""
    import shutil
    import subprocess
    import tempfile
    import wave

    if shutil.which("piper") is None:
        return None
    model = os.environ.get("PIPER_MODEL")
    if not model:
        return None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            out_path = tmp.name
        subprocess.run(
            ["piper", "--model", model, "--output_file", out_path],
            input=text.encode("utf-8"), check=True, capture_output=True,
        )
        with wave.open(out_path, "rb") as wf:
            raw = wf.readframes(wf.getnframes())
            data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
            src_sr = wf.getframerate()
        if src_sr != SR:
            data = _resample(data, src_sr, SR)
        return data
    except Exception as exc:  # noqa: BLE001
        print(f"  [tts] piper failed ({exc}); using synth")
        return None


def _resample(data: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst or data.size == 0:
        return data
    n = int(len(data) * dst / src)
    return np.interp(np.linspace(0, len(data), n, endpoint=False), np.arange(len(data)), data).astype(np.float32)
