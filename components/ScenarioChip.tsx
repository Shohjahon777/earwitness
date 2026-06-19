import { SlidersHorizontal } from "lucide-react";

export function ScenarioChip({ label }: { label: string }) {
  return (
    <span className="scenario-chip">
      <SlidersHorizontal size={16} aria-hidden="true" />
      Scenario: {label}
    </span>
  );
}
