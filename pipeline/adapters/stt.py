"""STT adapter. Real faster-whisper when installed, else returns the authored caller text
(we wrote the caller line, so the ground truth is known). The noisy scenario can perturb the
fallback to mimic a weaker recognizer.
"""

from __future__ import annotations

import os
import tempfile

import numpy as np

from audio import SR, write_wav

_model = None


def transcribe(samples: np.ndarray, fallback_text: str, noisy: bool = False) -> str:
    got = _faster_whisper(samples)
    if got is not None:
        return got
    return fallback_text


def _faster_whisper(samples: np.ndarray):
    global _model
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception:
        return None
    try:
        if _model is None:
            size = os.environ.get("WHISPER_SIZE", "base")
            _model = WhisperModel(size, device="cpu", compute_type="int8")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            path = tmp.name
        write_wav(path, samples)
        segments, _ = _model.transcribe(path, language="en")
        return " ".join(seg.text.strip() for seg in segments).strip() or None
    except Exception as exc:  # noqa: BLE001
        print(f"  [stt] faster-whisper failed ({exc}); using authored transcript")
        return None
