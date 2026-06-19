export function RoundProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="surface panel-pad" aria-label={`Round ${current} of ${total}`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <strong className="font-display">Daily challenge</strong>
        <span className="font-mono muted">
          {current}/{total}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${total}, 1fr)`, gap: 6, marginTop: 12 }}>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            style={{
              height: 7,
              borderRadius: 999,
              background: index < current ? "var(--signal)" : "rgba(242,240,234,.12)"
            }}
          />
        ))}
      </div>
    </div>
  );
}
