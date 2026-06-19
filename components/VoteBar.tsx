import type { Pick } from "@/lib/types";

export function VoteBar({
  enabled,
  mode,
  onVote,
  disabledReason,
  submitting,
  heardA,
  heardB
}: {
  enabled: boolean;
  mode: "arena" | "golden-ears";
  onVote: (pick: Pick) => void;
  disabledReason: string;
  submitting: boolean;
  heardA?: boolean;
  heardB?: boolean;
}) {
  return (
    <div className="vote-bar" data-ready={enabled}>
      <div className="vote-status" aria-live="polite">
        <span className="listen-step" data-done={heardA}>A heard</span>
        <span className="listen-step" data-done={heardB}>B heard</span>
        <strong>{enabled ? "Vote unlocked" : "Vote locked"}</strong>
      </div>
      <div className="vote-actions" data-has-tie={mode === "arena"}>
        <button className="primary-btn" disabled={!enabled || submitting} onClick={() => onVote("A")}>
          {mode === "arena" ? "Vote A" : "A is human"}
        </button>
        <button className="primary-btn" disabled={!enabled || submitting} onClick={() => onVote("B")}>
          {mode === "arena" ? "Vote B" : "B is human"}
        </button>
        {mode === "arena" ? (
          <button className="plain-btn" disabled={!enabled || submitting} onClick={() => onVote("tie")}>
            Tie
          </button>
        ) : null}
      </div>
      <div className="vote-hint">{enabled ? "Keyboard: 1 votes A, 2 votes B." : disabledReason}</div>
    </div>
  );
}
