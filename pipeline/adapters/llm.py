"""LLM adapter. Real path uses Vercel AI Gateway with a plain "provider/model" string
(default: latest Claude). Falls back to the scenario's canned reply when no key/adapter.
"""

from __future__ import annotations

import os


SYSTEM = (
    "You are a concise, friendly voice agent on a phone call. Reply in ONE short spoken "
    "sentence. No markdown, no lists — this will be read aloud."
)


def reply(scenario, caller_transcript: str, stack) -> str:
    if getattr(stack, "llm_provider", "canned") == "gateway":
        got = _gateway(scenario, caller_transcript)
        if got:
            return got
    return scenario.agent_reply


def _gateway(scenario, caller_transcript: str):
    key = os.environ.get("AI_GATEWAY_API_KEY")
    if not key:
        return None
    try:
        import requests

        model = os.environ.get("PIPELINE_LLM_MODEL", "anthropic/claude-opus-4-8")
        resp = requests.post(
            "https://ai-gateway.vercel.sh/v1/chat/completions",
            headers={"authorization": f"Bearer {key}", "content-type": "application/json"},
            json={
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
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:  # noqa: BLE001
        print(f"  [llm] gateway failed ({exc}); using canned reply")
        return None
