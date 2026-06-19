"use client";

import type { Dimension } from "@/lib/types";

const dimensions: Array<{ value: Dimension; label: string }> = [
  { value: "overall", label: "Overall" },
  { value: "naturalness", label: "Naturalness" },
  { value: "interaction", label: "Interaction handling" }
];

export function DimensionTabs({
  value,
  onChange
}: {
  value: Dimension;
  onChange: (dimension: Dimension) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Stack rating dimension">
      {dimensions.map((dimension) => (
        <button key={dimension.value} role="tab" data-active={value === dimension.value} onClick={() => onChange(dimension.value)}>
          {dimension.label}
        </button>
      ))}
    </div>
  );
}
