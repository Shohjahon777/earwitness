"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

// The actual share action. On phones it opens the native share sheet (WhatsApp/Telegram/iMessage)
// via the Web Share API; on desktop it falls back to copying the link with a "Copied" confirmation.
export function ShareButton({
  shareId,
  label = "Share",
  text = "Can you beat my score? Spot the AI on Earwitness.",
  className = "primary-btn"
}: {
  shareId: string;
  label?: string;
  text?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = `${window.location.origin}/c/${shareId}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Earwitness", text, url });
        return;
      } catch (err) {
        // User dismissed the native sheet — don't fall through to a surprise copy.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button type="button" className={className} onClick={onShare} aria-live="polite">
      {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
      {copied ? "Link copied" : label}
    </button>
  );
}
