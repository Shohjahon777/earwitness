export function BalanceIndicator({
  prompt,
  tilt,
  pulsing,
  leftReady = false,
  rightReady = false
}: {
  prompt: string;
  tilt: number;
  pulsing: boolean;
  leftReady?: boolean;
  rightReady?: boolean;
}) {
  return (
    <div
      className="balance"
      data-pulsing={pulsing}
      style={{ "--tilt": tilt } as React.CSSProperties}
      aria-live="polite"
    >
      <div className="balance-meter" aria-hidden="true">
        <span className="meter-label" data-ready={leftReady}>A</span>
        <span className="balance-line" />
        <span className="meter-label" data-ready={rightReady}>B</span>
      </div>
      <span className="font-display">{prompt}</span>
    </div>
  );
}
