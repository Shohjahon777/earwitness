import type { ShareCardData } from "@/lib/types";

export function ShareCard({ data, variant = "page" }: { data: ShareCardData; variant?: "page" | "og" }) {
  const score = data.stats.score ? `${data.stats.score}/5` : `${data.stats.accuracy}%`;
  const label = data.stats.score ? "Daily score" : "AI-detection";

  return (
    <article
      className="share-card"
      style={{
        padding: variant === "og" ? 56 : 22,
        minHeight: variant === "og" ? 520 : 420,
        display: "grid",
        alignContent: "space-between",
        gap: 22
      }}
    >
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div className="brand-mark">
            <span className="brand-dot" aria-hidden="true" />
            Earwitness
          </div>
          <span className="share-badge">Golden ears</span>
        </div>
        <p className="muted" style={{ margin: "18px 0 0", maxWidth: 520 }}>
          {data.tagline}
        </p>
      </div>

      <div>
        <div className="share-score">{score}</div>
        <div className="font-display" style={{ fontSize: variant === "og" ? 36 : 24, fontWeight: 800 }}>
          {label}
        </div>
        <div className="share-metrics">
          <span className="share-badge">{data.stats.handle}</span>
          <span className="share-badge">Streak {data.stats.streak}</span>
          {data.stats.percentile ? <span className="share-badge">Top {100 - data.stats.percentile}% today</span> : null}
        </div>
      </div>

      <div className="primary-btn" style={{ width: "fit-content", paddingInline: 18 }}>
        Can you beat it?
      </div>
    </article>
  );
}
