"""LLM adapter. Real path uses Vercel AI Gateway with a plain "provider/model" string
(default: latest Claude). Falls back to the scenario's canned reply when no key/adapter.
"""

from __future__ import annotations

import os
import time


SYSTEM = (
    "You are a concise, friendly voice agent on a phone call. Reply in ONE short spoken "
    "sentence. No markdown, no lists — this will be read aloud."
)

# Gentle pacing so bulk generation doesn't trip the gateway's per-minute limit. Override with
# PIPELINE_LLM_THROTTLE_S. Retries back off on 429/5xx, honoring a Retry-After header when present.
THROTTLE_S = float(os.environ.get("PIPELINE_LLM_THROTTLE_S", "1.5"))
MAX_RETRIES = int(os.environ.get("PIPELINE_LLM_RETRIES", "5"))
_last_call = 0.0


def reply(scenario, caller_transcript: str, stack) -> str:
    if getattr(stack, "llm_provider", "canned") == "gateway":
        got = _gateway(scenario, caller_transcript, stack)
        if got:
            return got
    return scenario.agent_reply


def _gateway(scenario, caller_transcript: str, stack):
    global _last_call
    key = os.environ.get("AI_GATEWAY_API_KEY")
    if not key:
        print(f"  [llm] {stack.id}: no AI_GATEWAY_API_KEY → canned reply (words won't differ per stack)")
        return None

    import requests

    # Per-stack model so each stack's words come from a different LLM. PIPELINE_LLM_MODEL still
    # works as a global override (useful for testing one model across the whole matrix).
    model = os.environ.get("PIPELINE_LLM_MODEL") or getattr(stack, "llm_model", "") or "openai/gpt-4o"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": f"Scenario: {scenario.label}. The caller said: \"{caller_transcript}\". Respond.",
            },
        ],
        "max_tokens": 80,
        "temperature": 0.6,
    }

    for attempt in range(MAX_RETRIES):
        # space out calls so we don't burst into the rate limit
        wait = THROTTLE_S - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            resp = requests.post(
                "https://ai-gateway.vercel.sh/v1/chat/completions",
                headers={"authorization": f"Bearer {key}", "content-type": "application/json"},
                json=payload,
                timeout=60,
            )
            _last_call = time.monotonic()
            if resp.status_code == 429 or resp.status_code >= 500:
                # Retryable: honor Retry-After, else exponential backoff (2,4,8,16s ...).
                retry_after = resp.headers.get("retry-after")
                backoff = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** (attempt + 1)
                if attempt < MAX_RETRIES - 1:
                    print(f"  [llm] {stack.id} {resp.status_code} on '{model}' → retry in {backoff:.0f}s ({attempt + 1}/{MAX_RETRIES})")
                    time.sleep(backoff)
                    continue
                print(f"  [llm] {stack.id} model '{model}' gave {resp.status_code} after {MAX_RETRIES} tries; canned reply")
                return None
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as exc:  # noqa: BLE001
            _last_call = time.monotonic()
            print(f"  [llm] {stack.id} model '{model}' failed ({exc}); using canned reply")
            return None
    return None
