import Link from "next/link";
import { AppChrome } from "@/components/AppChrome";

export default function NotFound() {
  return (
    <AppChrome mode="arena">
      <section className="surface empty-state">
        <strong className="font-display">This signal is out of range.</strong>
        <span className="muted">Return to the arena and pick up a fresh matchup.</span>
        <Link className="primary-btn" href="/">
          Back to arena
        </Link>
      </section>
    </AppChrome>
  );
}
