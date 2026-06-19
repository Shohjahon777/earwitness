"""VAD adapter. Real Silero VAD when torch is installed, else the energy VAD from audio.py.

Used to find the caller's end-of-speech (endpoint) that drives the agent's response timing —
each stack applies its own endpoint_silence threshold on top.
"""

from __future__ import annotations

import numpy as np

from audio import SR, vad_regions


def speech_regions(samples: np.ndarray):
    got = _silero(samples)
    if got is not None:
        return got
    return vad_regions(samples)


def _silero(samples: np.ndarray):
    try:
        import torch  # type: ignore
        from silero_vad import get_speech_timestamps, load_silero_vad  # type: ignore
    except Exception:
        return None
    try:
        model = load_silero_vad()
        ts = get_speech_timestamps(torch.from_numpy(samples), model, sampling_rate=SR)
        return [(t["start"] / SR, t["end"] / SR) for t in ts]
    except Exception:
        return None
