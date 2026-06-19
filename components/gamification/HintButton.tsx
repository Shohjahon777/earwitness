"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { spendHint } from "@/lib/api";
import { useSessionStore } from "@/lib/store";

// Golden-ears only: spend a hint credit to reveal the scenario tell before voting.
export function HintButton({ roundId }: { roundId: string }) {
  const hints = useSessionStore((s) => s.hintsOwned);
  const setHintsOwned = useSessionStore((s) => s.setHintsOwned);
  const [tell, setTell] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  if (tell) {
    return (
      <div className="hint-reveal" role="status">
        <Lightbulb size={15} aria-hidden="true" /> {tell}
      </div>
    );
  }

  if (hints < 1) {
    return (
      <Link className="hint-btn" href="/shop" data-empty="true">
        <Lightbulb size={15} aria-hidden="true" /> No hints — get one
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="hint-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setErr(false);
        try {
          const res = await spendHint(roundId);
          setTell(res.tell);
          setHintsOwned(res.hintsOwned);
        } catch {
          setErr(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Lightbulb size={15} aria-hidden="true" /> {err ? "Try again" : `Use hint (${hints})`}
    </button>
  );
}
