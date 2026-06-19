"use client";

import { useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

// Tiny accessible "what is this?" affordance — tap on mobile, hover/focus on desktop.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="infotip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <HelpCircle size={13} aria-hidden="true" />
      </button>
      {open ? (
        <span className="infotip-pop" role="tooltip">
          {children}
        </span>
      ) : null}
    </span>
  );
}
