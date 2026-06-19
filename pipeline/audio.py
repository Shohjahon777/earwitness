"""Low-level audio: synthesis, energy VAD, loudness normalization, mixing, WAV write.

Everything here runs on numpy + soundfile alone so the pipeline renders with zero heavy
deps. Real STT/VAD/TTS adapters layer on top (see adapters/) and degrade to these.
"""

from __future__ import annotations

import numpy as np
import soundfile as sf

SR = 24_000  # sample rate for the whole pipeline


def _word_count(text: str) -> int:
    return max(1, len(text.split()))


def synth_utterance(text: str, base_hz: float, jitter: float = 0.03, wpm: int = 150) -> np.ndarray:
    """Render a voice-ish utterance from text.

    Not real speech — a sequence of voiced "syllables" with formant structure, prosody drift
    and inter-word gaps. Intelligibility is irrelevant; the engine's job is to prove TURN-TAKING
    timing, which is fully audible with this synth. Real voices come from the TTS adapters.
    """
    if not text.strip():
        return np.zeros(0, dtype=np.float32)

    rng = np.random.default_rng(abs(hash(text)) % (2**32))
    words = text.split()
    sec_per_word = 60.0 / wpm
    out = []
    phrase_drift = np.linspace(0, -0.08, len(words))  # gentle falling intonation
    for i, word in enumerate(words):
        syllables = max(1, round(len(word) / 3))
        wdur = sec_per_word * (0.6 + 0.4 * syllables)
        n = int(wdur * SR)
        t = np.arange(n) / SR
        # pitch contour: base + question/drift + per-word jitter
        f0 = base_hz * (1.0 + phrase_drift[i] + rng.normal(0, jitter))
        f0 = max(80.0, f0)
        # voiced source: fundamental + a few harmonics (formant-ish)
        sig = (
            0.55 * np.sin(2 * np.pi * f0 * t)
            + 0.22 * np.sin(2 * np.pi * 2 * f0 * t)
            + 0.12 * np.sin(2 * np.pi * 3 * f0 * t)
        )
        # syllable amplitude modulation so it sounds spoken, not droned
        am = 0.6 + 0.4 * np.abs(np.sin(np.pi * syllables * t / max(t[-1], 1e-6)))
        env = _adsr(n)
        out.append((sig * am * env).astype(np.float32))
        # short gap between words
        out.append(np.zeros(int(0.06 * SR * (1 + rng.random())), dtype=np.float32))
    return np.concatenate(out) if out else np.zeros(0, dtype=np.float32)


def _adsr(n: int) -> np.ndarray:
    env = np.ones(n, dtype=np.float32)
    a = min(int(0.01 * SR), n // 2)
    r = min(int(0.04 * SR), n // 2)
    if a:
        env[:a] = np.linspace(0, 1, a)
    if r:
        env[-r:] = np.linspace(1, 0, r)
    return env


def add_noise(samples: np.ndarray, snr_db: float = 8.0) -> np.ndarray:
    """Degrade a track for the noisy/accented scenario."""
    if samples.size == 0:
        return samples
    sig_power = np.mean(samples**2) + 1e-9
    noise_power = sig_power / (10 ** (snr_db / 10))
    noise = np.random.default_rng(7).normal(0, np.sqrt(noise_power), samples.shape)
    return (samples + noise).astype(np.float32)


def silence(ms: int) -> np.ndarray:
    return np.zeros(int(ms / 1000 * SR), dtype=np.float32)


def vad_regions(samples: np.ndarray, frame_ms: int = 20, thresh_db: float = -38.0):
    """Energy-based voice activity detection → list of (start_s, end_s) speech regions.

    Real Silero VAD plugs in via adapters.vad if torch is installed; this is the always-on
    fallback and is plenty for our authored caller tracks.
    """
    if samples.size == 0:
        return []
    frame = int(frame_ms / 1000 * SR)
    n_frames = len(samples) // frame
    regions = []
    start = None
    for i in range(n_frames):
        seg = samples[i * frame : (i + 1) * frame]
        rms = np.sqrt(np.mean(seg**2) + 1e-12)
        db = 20 * np.log10(rms + 1e-12)
        voiced = db > thresh_db
        if voiced and start is None:
            start = i * frame / SR
        elif not voiced and start is not None:
            regions.append((start, i * frame / SR))
            start = None
    if start is not None:
        regions.append((start, n_frames * frame / SR))
    return regions


def loudness_normalize(samples: np.ndarray, target_lufs: float = -16.0) -> np.ndarray:
    """Normalize to a target loudness so no clip wins on volume alone.

    Uses pyloudnorm (ITU-R BS.1770) when available; otherwise an RMS-based approximation.
    """
    if samples.size == 0:
        return samples
    try:
        import pyloudnorm as pyln  # type: ignore

        meter = pyln.Meter(SR)
        loudness = meter.integrated_loudness(samples.astype(np.float64))
        if np.isinf(loudness):
            raise ValueError("silent")
        out = pyln.normalize.loudness(samples.astype(np.float64), loudness, target_lufs)
        return _limit(out.astype(np.float32))
    except Exception:
        rms = np.sqrt(np.mean(samples**2) + 1e-12)
        # crude LUFS≈ -0.691 + 20log10(rms); solve gain for target
        cur_lufs = -0.691 + 20 * np.log10(rms + 1e-12)
        gain = 10 ** ((target_lufs - cur_lufs) / 20)
        return _limit((samples * gain).astype(np.float32))


def _limit(samples: np.ndarray, ceiling: float = 0.97) -> np.ndarray:
    peak = np.max(np.abs(samples)) + 1e-9
    if peak > ceiling:
        samples = samples * (ceiling / peak)
    return samples


def overlay(base: np.ndarray, clip: np.ndarray, at_s: float, gain: float = 1.0) -> np.ndarray:
    """Place `clip` onto `base` starting at `at_s`, extending base as needed."""
    start = int(at_s * SR)
    end = start + len(clip)
    if end > len(base):
        base = np.concatenate([base, np.zeros(end - len(base), dtype=np.float32)])
    base[start:end] += clip * gain
    return base


def write_wav(path: str, samples: np.ndarray):
    sf.write(path, _limit(samples), SR, subtype="PCM_16")


def duration_s(samples: np.ndarray) -> float:
    return len(samples) / SR
