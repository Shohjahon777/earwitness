import { Activity } from "lucide-react";

export function ScorePill({ value, label = "Accuracy" }: { value: number; label?: string }) {
  return (
    <span className="stat-pill" aria-label={`${label}: ${value}%`}>
      <Activity size={15} aria-hidden="true" />
      {label} <strong>{value}%</strong>
    </span>
  );
}
