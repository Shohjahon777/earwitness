import { Flame } from "lucide-react";

export function StreakFlame({
  count,
  event
}: {
  count: number;
  event?: "grow" | "break";
}) {
  return (
    <span className="stat-pill" data-event={event} aria-label={`Current streak: ${count}`}>
      <Flame size={15} aria-hidden="true" />
      Streak <strong>{count}</strong>
    </span>
  );
}
