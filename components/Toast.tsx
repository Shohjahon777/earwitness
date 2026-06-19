import { WifiOff } from "lucide-react";

export function Toast({ message, tone = "signal" }: { message: string; tone?: "signal" | "danger" }) {
  return (
    <div
      className="status-banner"
      role="status"
      aria-live="polite"
      style={tone === "danger" ? { borderColor: "var(--danger)", background: "rgba(255,139,139,.1)" } : undefined}
    >
      <WifiOff size={16} aria-hidden="true" />
      {message}
    </div>
  );
}
