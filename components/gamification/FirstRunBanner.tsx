"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

const KEY = "ew_seen_intro";

// One-time, dismissible orientation for newcomers — no wall, just a pointer to /about.
export function FirstRunBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      // private mode — just skip
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="firstrun" role="note">
      <Sparkles size={16} aria-hidden="true" />
      <span>
        New here? You earn <strong>coins</strong> and <strong>signal</strong> for every vote.{" "}
        <Link href="/about" className="firstrun-link" onClick={dismiss}>
          How it works →
        </Link>
      </span>
      <button type="button" className="icon-button firstrun-close" onClick={dismiss} aria-label="Dismiss">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
