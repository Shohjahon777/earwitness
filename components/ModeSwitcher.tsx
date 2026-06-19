import Link from "next/link";
import type { Mode } from "@/lib/types";

export function ModeSwitcher({ mode }: { mode: Mode }) {
  return (
    <nav className="mode-switcher" aria-label="Mode switcher">
      <Link href="/" data-active={mode === "arena"}>
        <span aria-hidden="true" className="mode-dot mode-dot-a" />
        Arena
      </Link>
      <Link href="/golden-ears" data-active={mode === "golden-ears"}>
        <span aria-hidden="true" className="mode-dot mode-dot-b" />
        Golden ears
      </Link>
    </nav>
  );
}
