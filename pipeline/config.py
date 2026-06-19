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


# Hybrid provider wiring: ONE real premium path (ElevenLabs + Claude via AI Gateway) and one
# local path get genuine contrast; the rest are local synth + turn-policy/quality variants.
STACKS = [
    Stack(
        id="premium", name="Premium",
        stt="Deepgram Nova-3", llm="GPT-4o", tts="ElevenLabs", turns="barge-in: yes",
        barge_in="yield", reaction_ms=170, latency_ms=420, endpoint_silence_ms=420,
        voice_base_hz=172.0, voice_jitter=0.05, tts_provider="elevenlabs", llm_provider="gateway",
    ),
    Stack(
        id="fast-cheap", name="Fast/cheap",
        stt="Whisper tiny", llm="GPT-4.1 mini", tts="Cartesia Sonic", turns="barge-in: limited",
        barge_in="yield", reaction_ms=320, latency_ms=250, endpoint_silence_ms=220,
        voice_base_hz=196.0, voice_jitter=0.02,
    ),
    Stack(
        # Engineered to lose: gorgeous voice, never yields. This is the thesis.
        id="pretty-rude", name="Pretty-but-rude",
        stt="AssemblyAI", llm="Claude Haiku", tts="PlayHT", turns="talks over",
        barge_in="talk_over", reaction_ms=0, latency_ms=500, endpoint_silence_ms=520,
        voice_base_hz=160.0, voice_jitter=0.06,
    ),
    Stack(
        id="robust", name="Robust",
        stt="Deepgram enhanced", llm="GPT-5 mini", tts="OpenAI voice", turns="yielding",
        barge_in="duck", reaction_ms=210, latency_ms=520, endpoint_silence_ms=600,
        voice_base_hz=184.0, voice_jitter=0.03,
    ),
    Stack(
        id="local", name="Local-baseline",
        stt="Vosk", llm="Llama local", tts="Piper", turns="push-to-talk",
        barge_in="yield", reaction_ms=480, latency_ms=900, endpoint_silence_ms=700,
        voice_base_hz=120.0, voice_jitter=0.01, tts_provider="piper",
    ),
    Stack(
        id="human", name="Human agent",
        stt="Ear", llm="Working memory", tts="Live voice", turns="natural pauses",
        is_human=True,
        barge_in="yield", reaction_ms=300, latency_ms=650, endpoint_silence_ms=550,
        voice_base_hz=150.0, voice_jitter=0.10,
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
    agent_resume: str = "Sorry — go ahead."  # what a yielding agent says after stopping


SCENARIOS = [
    Scenario(
        id="interrupt", label="Customer interrupts", type="interrupt",
        insight="B had the nicer voice but talked over the customer. Good agents yield.",
        caller_open="Hi, I'm calling about my booking for Friday.",
        caller_interjection="Wait, no, actually make it Saturday.",
        interject_at_ms=1100,
        agent_reply="Absolutely, I can help with your Friday booking. Let me pull that up and confirm the details for you.",
    ),
    Scenario(
        id="pause", label="Long pause after price shock", type="pause",
        insight="The better stack left space, then answered with context instead of rushing.",
        caller_open="So the total comes to three hundred dollars?",
        caller_interjection="...is there anything cheaper?",
        interject_at_ms=1300,
        agent_reply="Yes, three hundred is the standard rate, but let me walk you through what's included and a couple of lower-cost options.",
    ),
    Scenario(
        id="accent", label="Noisy accented caller", type="accent",
        insight="Robust speech recognition mattered more than the prettiest voice here.",
        caller_open="Yeah hi, the line's a bit rough, can you hear me okay about the refund?",
        caller_interjection="No, the OTHER order.",
        interject_at_ms=1200,
        agent_reply="I can hear you. I see your most recent order here and I can start the refund right away.",
        noisy=True,
    ),
    Scenario(
        id="clean", label="Clean booking call", type="clean",
        insight="When the audio is easy, turn handling and timing decide the winner.",
        caller_open="Hi, I'd like to book a table for two at seven tonight.",
        caller_interjection="",  # no interruption in the clean scenario
        interject_at_ms=0,
        agent_reply="Of course — a table for two at seven o'clock tonight. May I have a name for the reservation?",
    ),
]
