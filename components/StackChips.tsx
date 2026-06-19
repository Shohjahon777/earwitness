import type { StackConfig } from "@/lib/types";

export function StackChips({ stack }: { stack: StackConfig }) {
  return (
    <div className="chip-grid" aria-label={`${stack.name} stack configuration`}>
      <span className="stack-chip">
        <b>STT</b>
        {stack.stt}
      </span>
      <span className="stack-chip">
        <b>LLM</b>
        {stack.llm}
      </span>
      <span className="stack-chip">
        <b>TTS</b>
        {stack.tts}
      </span>
      <span className="stack-chip">
        <b>Turns</b>
        {stack.turns}
      </span>
    </div>
  );
}
