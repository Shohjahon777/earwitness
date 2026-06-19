"""Render clips offline.

Usage:
  python run.py proof          # the make-or-break artifact: interruption, yield vs talk-over
  python run.py all            # full (scenario x stack) matrix + manifest.json for seeding
  python run.py all --only premium,pretty-rude

Outputs WAV + per-clip transcript JSON into pipeline/out/, plus a manifest.json that
scripts/seed.ts uploads to Vercel Blob and writes into Postgres.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import engine
from config import SCENARIOS, STACKS

OUT = os.path.join(os.path.dirname(__file__), "out")


def _slug(scenario_id: str, stack_id: str) -> str:
    return f"{scenario_id}__{stack_id}"


def _render_one(scenario, stack) -> dict:
    print(f"  rendering {scenario.id} x {stack.id} ({stack.barge_in}) ...", flush=True)
    mix, transcript, dur = engine.render(scenario, stack)
    name = _slug(scenario.id, stack.id)
    wav_path = os.path.join(OUT, f"{name}.wav")
    json_path = os.path.join(OUT, f"{name}.json")
    import audio

    audio.write_wav(wav_path, mix)
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(transcript, fh, indent=2)
    print(f"    -> {name}.wav  ({dur:.1f}s, {transcript['outcome']})")
    return {
        "scenarioId": scenario.id,
        "stackId": stack.id,
        "file": f"{name}.wav",
        "durationSec": round(dur, 3),
        "transcript": transcript,
    }


def cmd_proof():
    os.makedirs(OUT, exist_ok=True)
    scenario = next(s for s in SCENARIOS if s.id == "interrupt")
    yielding = next(s for s in STACKS if s.id == "premium")
    rude = next(s for s in STACKS if s.id == "pretty-rude")
    print("Proof: the interruption scenario through a YIELDING stack vs a TALK-OVER stack.")
    _render_one(scenario, yielding)
    _render_one(scenario, rude)
    print(
        "\nListen to pipeline/out/interrupt__premium.wav (agent stops on the barge-in) vs\n"
        "pipeline/out/interrupt__pretty-rude.wav (agent plows on over the caller).\n"
        "If that contrast isn't convincing, stop and rethink the engine."
    )


def cmd_all(only: list[str] | None):
    os.makedirs(OUT, exist_ok=True)
    stacks = [s for s in STACKS if not only or s.id in only]
    clips = []
    for scenario in SCENARIOS:
        for stack in stacks:
            clips.append(_render_one(scenario, stack))

    manifest = {
        "stacks": [
            {
                "id": s.id, "name": s.name, "stt": s.stt, "llm": s.llm,
                "tts": s.tts, "turns": s.turns, "isHuman": s.is_human,
            }
            for s in stacks
        ],
        "scenarios": [
            {"id": s.id, "label": s.label, "type": s.type, "insight": s.insight}
            for s in SCENARIOS
        ],
        "clips": clips,
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    print(f"\nWrote {len(clips)} clips + manifest.json to pipeline/out/")
    print("Next: `npm run db:push` then `npm run db:seed` to upload + seed.")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("proof")
    p_all = sub.add_parser("all")
    p_all.add_argument("--only", help="comma-separated stack ids", default="")
    args = parser.parse_args()

    if args.cmd == "proof":
        cmd_proof()
    elif args.cmd == "all":
        only = [x for x in args.only.split(",") if x] or None
        cmd_all(only)


if __name__ == "__main__":
    sys.exit(main())
