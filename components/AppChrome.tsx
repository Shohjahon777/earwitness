import Link from "next/link";
import { CalendarDays, Info, Radio } from "lucide-react";
import { ModeSwitcher } from "./ModeSwitcher";
import { MobileDock } from "./MobileDock";

interface AppChromeProps {
  mode?: "arena" | "golden-ears";
  mobileDock?: boolean;
  children: React.ReactNode;
}

export function AppChrome({ mode = "arena", mobileDock = true, children }: AppChromeProps) {
  return (
    <main className="app-shell" data-mobile-dock={mobileDock}>
      <header className="top-bar">
        <Link href="/" className="brand-mark" aria-label="Earwitness arena">
          <span className="brand-dot" aria-hidden="true" />
          <span>Earwitness</span>
          <span className="signal-status" aria-label="Live blind-test signal">Live</span>
        </Link>
        <div className="nav-actions">
          <ModeSwitcher mode={mode} />
          <Link className="daily-link" href="/daily">
            <CalendarDays size={16} aria-hidden="true" />
            <span>Daily challenge</span>
          </Link>
          <Link className="icon-button" href="/about" aria-label="How Earwitness works">
            <Info size={18} aria-hidden="true" />
          </Link>
          <Link className="icon-button" href="/leaderboard" aria-label="Open leaderboard">
            <Radio size={18} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {children}
      {mobileDock ? <MobileDock /> : null}
    </main>
  );
}
