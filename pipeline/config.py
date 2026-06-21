"""Stack + scenario definitions for the offline render matrix.

Stack ids MUST match the frontend / seed (lib/api.ts, scripts/seed.ts) so the published
leaderboard and the "pretty-rude loses on interaction" proof note line up.
"""

from dataclasses import dataclass, field


@dataclass
class Stack:
    id: str
    name: str
    stt: str
    llm: str
    tts: str
    turns: str  # human-readable turn label shown in the reveal chips
    is_human: bool = False

    # --- turn-policy knobs the engine actually renders ---
    barge_in: str = "yield"     # "yield" | "talk_over" | "duck"
    reaction_ms: int = 220       # how fast the agent reacts to a barge-in (yield/duck)
    latency_ms: int = 450        # response latency after the caller's endpoint
    endpoint_silence_ms: int = 500  # silence needed to declare the caller done
    voice_base_hz: float = 180.0    # synth fallback pitch
    voice_jitter: float = 0.02      # prosody naturalness (higher = more human)
    # which real provider adapters to attempt (else fall back to synth/canned)
    tts_provider: str = "synth"  # "elevenlabs" | "piper" | "synth"
    llm_provider: str = "canned"  # "gateway" | "canned"
    # AI Gateway "provider/model" slug used when llm_provider == "gateway". Distinct per stack so
    # the agent's WORDS genuinely come from a different model, not just a different voice. If a slug
    # is wrong/unavailable the adapter prints a warning and falls back to the canned reply.
    llm_model: str = ""
    # ElevenLabs premade voice id — distinct per stack so each one sounds like a different
    # real system (not the same voice with different timing). MUST differ from the caller's
    # voice (Domi, AZnzlk1XvdvUeBnXmlld) so caller and agent never sound identical.
    eleven_voice_id: str = ""


# Hybrid provider wiring: ONE real premium path (ElevenLabs + Claude via AI Gateway) and one
# local path get genuine contrast; the rest are local synth + turn-policy/quality variants.
STACKS = [
    Stack(
        id="premium", name="Premium",
        stt="Deepgram Nova-3", llm="GPT-4o", tts="ElevenLabs", turns="barge-in: yes",
        barge_in="yield", reaction_ms=170, latency_ms=420, endpoint_silence_ms=420,
        voice_base_hz=172.0, voice_jitter=0.05, tts_provider="elevenlabs", llm_provider="gateway",
        llm_model="openai/gpt-4o",
        eleven_voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel — warm, natural female
    ),
    Stack(
        id="fast-cheap", name="Fast/cheap",
        stt="Whisper tiny", llm="GPT-4o mini", tts="Cartesia Sonic", turns="barge-in: limited",
        barge_in="yield", reaction_ms=320, latency_ms=250, endpoint_silence_ms=220,
        voice_base_hz=196.0, voice_jitter=0.02, tts_provider="elevenlabs", llm_provider="gateway",
        llm_model="openai/gpt-4o-mini",
        eleven_voice_id="ErXwobaYiN019PkySvjV",  # Antoni — male
    ),
    Stack(
        # Engineered to lose: gorgeous voice, never yields. This is the thesis.
        id="pretty-rude", name="Pretty-but-rude",
        stt="AssemblyAI", llm="Claude Haiku 4.5", tts="PlayHT", turns="talks over",
        barge_in="talk_over", reaction_ms=0, latency_ms=500, endpoint_silence_ms=520,
        voice_base_hz=160.0, voice_jitter=0.06, tts_provider="elevenlabs", llm_provider="gateway",
        llm_model="anthropic/claude-haiku-4-5",
        eleven_voice_id="EXAVITQu4vr4xnSDxMaL",  # Bella — gorgeous voice (the "pretty" half of the thesis)
    ),
    Stack(
        id="robust", name="Robust",
        stt="Deepgram enhanced", llm="Claude Sonnet 4.6", tts="ElevenLabs", turns="careful recovery",
        barge_in="duck", reaction_ms=210, latency_ms=520, endpoint_silence_ms=600,
        voice_base_hz=184.0, voice_jitter=0.03, tts_provider="elevenlabs", llm_provider="gateway",
        llm_model="anthropic/claude-sonnet-4-6",
        eleven_voice_id="pNInz6obpgDQGcFmaJgB",  # Adam — steady male
    ),
    Stack(
        id="local", name="Local-baseline",
        stt="Vosk", llm="Llama 3.3 70B", tts="Piper", turns="push-to-talk",
        barge_in="yield", reaction_ms=480, latency_ms=900, endpoint_silence_ms=700,
        voice_base_hz=120.0, voice_jitter=0.01, tts_provider="elevenlabs", llm_provider="gateway",
        llm_model="meta/llama-3.3-70b",
        eleven_voice_id="yoZ06aMxZJJ28mfd3POQ",  # Sam — plainer male; weakness is its slow timing, not the voice
    ),
    Stack(
        # A real person: never an LLM. Uses the scripted human line (ideally a real recording).
        id="human", name="Human agent",
        stt="Ear", llm="Working memory", tts="Live voice", turns="natural pauses",
        is_human=True,
        barge_in="yield", reaction_ms=300, latency_ms=650, endpoint_silence_ms=550,
        voice_base_hz=150.0, voice_jitter=0.10, tts_provider="elevenlabs",
        eleven_voice_id="MF3mGyEYCl7XYWbV9V6O",  # Elli — natural female (stand-in until a real human recording exists)
    ),
]


@dataclass
class Scenario:
    id: str
    label: str
    type: str  # interrupt | pause | accent | clean
    insight: str
    caller_open: str          # caller's first utterance
    caller_interjection: str  # what the caller says when they barge in (interrupt/pause)
    interject_at_ms: int      # offset into the AGENT's reply where the caller barges in
    agent_reply: str          # canned agent reply (used when no LLM adapter)
    noisy: bool = False       # accent/noise scenario → degrade caller track + STT
    agent_resume: str = "Of course. One moment."  # what a yielding agent says after stopping


SCENARIOS = [
    Scenario(
        id="interrupt", label="Customer interrupts", type="interrupt",
        insight="B had the nicer voice but talked over the customer. Good agents yield.",
        caller_open="Hi, I'm calling about my booking for Friday.",
        caller_interjection="Actually, can we make it Saturday instead?",
        interject_at_ms=1100,
        agent_reply="Sure, I can help with that Friday booking. I'll pull it up and check the details.",
        agent_resume="Got it. I'll switch that to Saturday.",
    ),
    Scenario(
        id="pause", label="Long pause after price shock", type="pause",
        insight="The better stack left space, then answered with context instead of rushing.",
        caller_open="So the total comes to three hundred dollars?",
        caller_interjection="Is there anything a bit cheaper?",
        interject_at_ms=1300,
        agent_reply="That's the standard rate. I can also check lower-cost options if that helps.",
        agent_resume="Absolutely. I can look for a lower-cost option.",
    ),
    Scenario(
        id="accent", label="Noisy accented caller", type="accent",
        insight="Robust speech recognition mattered more than the prettiest voice here.",
        caller_open="Yeah hi, the line's a bit rough, can you hear me okay about the refund?",
        caller_interjection="Sorry, I mean the other order.",
        interject_at_ms=1200,
        agent_reply="I can hear you. I'm opening your refund details now.",
        agent_resume="Thanks for clarifying. Let me check the other order.",
        noisy=True,
    ),
    Scenario(
        id="clean", label="Clean booking call", type="clean",
        insight="When the audio is easy, turn handling and timing decide the winner.",
        caller_open="Hi, I'd like to book a table for two at seven tonight.",
        caller_interjection="",  # no interruption in the clean scenario
        interject_at_ms=0,
        agent_reply="Of course. A table for two at seven tonight. What name should I put that under?",
    ),
]
