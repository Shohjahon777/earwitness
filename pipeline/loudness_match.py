"""Post-process: loudness-match the already-rendered clips in out/ so no clip wins on volume.

The engine normalizes per clip, but without pyloudnorm it used a crude RMS pass and the hard
limiter then scaled dense vs sparse clips unevenly — leaving an ~9 dB gated spread that biased
listeners toward the louder (wrong) stack. This re-matches every clip to one GATED target and
tames peaks with a tanh soft-clip (which preserves perceived loudness instead of scaling the
whole clip down). Operates on the existing WAVs only — no TTS/LLM calls, no cost.

    python loudness_match.py          # match all out/*.wav to TARGET_DB
"""

from __future__ import annotations

import glob
import os

import numpy as np
import soundfile as sf

SR = 24_000
TARGET_DB = -18.0   # common gated loudness for every clip
CEILING = 0.97


def gated_rms_db(x: np.ndarray, frame_ms: int = 400, rel_gate_db: float = -10.0) -> float:
    f = int(frame_ms / 1000 * SR)
    n = len(x) // f
    if n == 0:
        return -99.0
    e = np.array([np.sqrt(np.mean(x[i * f:(i + 1) * f] ** 2) + 1e-12) for i in range(n)])
    db = 20 * np.log10(e + 1e-12)
    keep = db > (db.max() + rel_gate_db)  # ignore the quiet/silent frames
    return float(20 * np.log10(np.sqrt(np.mean(e[keep] ** 2)) + 1e-12))


def soft_clip(x: np.ndarray, ceiling: float = CEILING) -> np.ndarray:
    """tanh soft-clip: leaves quiet speech untouched, smoothly compresses only the peaks."""
    return (ceiling * np.tanh(x / ceiling)).astype(np.float32)


def match(path: str) -> tuple[float, float]:
    x, _ = sf.read(path)
    if x.ndim > 1:
        x = x.mean(1)
    x = x.astype(np.float32)
    before = gated_rms_db(x)
    gain = 10 ** ((TARGET_DB - before) / 20)
    y = soft_clip(x * gain)
    # one corrective pass: tanh can pull loud clips slightly under target
    after1 = gated_rms_db(y)
    y = soft_clip(y * 10 ** ((TARGET_DB - after1) / 20))
    after = gated_rms_db(y)
    sf.write(path, y, SR, subtype="PCM_16")
    return before, after


def main() -> None:
    files = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "out", "*.wav")))
    if not files:
        print("No clips in out/. Render first.")
        return
    results = []
    for p in files:
        b, a = match(p)
        results.append(a)
        print(f"  {os.path.basename(p)[:-4]:26s} {b:6.1f} -> {a:6.1f} dB")
    print(f"\nMatched {len(files)} clips to {TARGET_DB:.0f} dB gated.")
    print(f"New spread: {min(results):.1f}..{max(results):.1f}  (range {max(results) - min(results):.1f} dB)")


if __name__ == "__main__":
    main()
