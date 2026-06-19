"use client";

import { useEffect, useState } from "react";
import { Check, Coins, Palette, Snowflake, Lightbulb, X } from "lucide-react";
import { getShop, purchaseItem, equipTheme } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import type { AchievementView, Shop, ShopItemView } from "@/lib/types";
import { AchievementToast } from "./AchievementToast";
import { ThemePreview } from "./ThemePreview";

const KIND_ICON = { theme: Palette, freeze: Snowflake, hint: Lightbulb } as const;

// Per-item "expanded face" copy: what it does + the value math.
function detail(item: ShopItemView): { how: string; math: string } {
  switch (item.kind) {
    case "theme":
      return {
        how: "Restyles the signal accent and ambience across the whole app. Channels A and B stay blue and coral so you never lose track of which is which.",
        math: `One-time ${item.price} coins, yours forever. The preview on the left is the real thing.`,
      };
    case "freeze":
      return {
        how: "Held in reserve and auto-consumed to bridge a single missed day, so your daily-login streak survives a slip.",
        math: `${item.price} coins. A 7-day login streak is worth ~190 bonus coins — one freeze protects all of it.`,
      };
    case "hint":
    default:
      return {
        how: "Spend one before a golden-ears vote to reveal the scenario's tell — what to listen for.",
        math: `${item.price} coins per use. Cheaper than breaking a long correct-streak on a hard round.`,
      };
  }
}

export function ShopView() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<AchievementView[] | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const setShopSnapshot = useSessionStore((s) => s.setShopSnapshot);
  const setTheme = useSessionStore((s) => s.setTheme);
  const unlockAchievements = useSessionStore((s) => s.unlockAchievements);

  async function refresh() {
    try {
      const data = await getShop();
      setShop(data);
      setShopSnapshot(data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load the shop.");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the expanded card on Escape.
  useEffect(() => {
    if (!expandedId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpandedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedId]);

  async function buy(item: ShopItemView) {
    setBusy(item.id);
    setError(null);
    try {
      const next = await purchaseItem(item.id);
      setShop(next);
      setShopSnapshot(next);
      unlockAchievements(next.achievementsUnlocked);
      setUnlocked(next.achievementsUnlocked);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Purchase failed.");
    } finally {
      setBusy(null);
    }
  }

  async function equip(item: ShopItemView) {
    const themeKey = item.id.replace(/^theme_/, "");
    setBusy(item.id);
    try {
      const res = await equipTheme(themeKey);
      setTheme(res.theme, res.ownedThemes);
      document.documentElement.setAttribute("data-theme", res.theme);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't equip.");
    } finally {
      setBusy(null);
    }
  }

  const items = shop?.items ?? [];
  const expanded = items.find((i) => i.id === expandedId) ?? null;

  function ActionButton({ item }: { item: ShopItemView }) {
    const affordable = (shop?.coins ?? 0) >= item.price;
    if (item.kind === "theme" && item.owned) {
      return item.equipped ? (
        <span className="stat-pill" style={{ color: "var(--human)" }}>
          <Check size={14} aria-hidden="true" /> Equipped
        </span>
      ) : (
        <button type="button" className="secondary-btn" disabled={busy === item.id} onClick={() => void equip(item)}>
          Equip
        </button>
      );
    }
    return (
      <button type="button" className="primary-btn" disabled={!affordable || busy === item.id} onClick={() => void buy(item)}>
        {busy === item.id ? "…" : item.kind === "theme" ? "Buy theme" : "Buy 1"}
      </button>
    );
  }

  return (
    <section className="page-grid">
      <div className="surface panel-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="font-display" style={{ margin: 0, fontSize: "clamp(1.8rem, 9vw, 3.2rem)", lineHeight: 1 }}>Shop</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>Tap a card for details. Spend credits on cosmetics, freezes, and hints.</p>
        </div>
        <span className="stat-pill" style={{ color: "var(--signal)" }}>
          <Coins size={16} aria-hidden="true" /> <strong>{shop?.coins?.toLocaleString() ?? "—"}</strong>
        </span>
      </div>

      {error ? <div className="surface empty-state" role="alert"><strong>{error}</strong></div> : null}

      <div className="shop-grid">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <button type="button" className="shop-card deck-card" data-owned={item.owned} key={item.id} onClick={() => setExpandedId(item.id)} aria-label={`${item.name} — details`}>
              <div className="shop-card-head">
                <Icon size={18} aria-hidden="true" />
                <strong className="font-display">{item.name}</strong>
              </div>
              <p className="muted" style={{ margin: 0, flex: 1 }}>{item.desc}</p>
              <div className="shop-card-foot">
                <span className="font-mono shop-price"><Coins size={14} aria-hidden="true" /> {item.price}</span>
                {item.kind === "theme" && item.equipped ? (
                  <span className="stat-pill" style={{ color: "var(--human)" }}><Check size={14} aria-hidden="true" /> On</span>
                ) : item.owned ? (
                  <span className="stat-pill">Owned</span>
                ) : (
                  <span className="font-mono muted">Tap →</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {expanded ? (
        <div className="deck-overlay" role="dialog" aria-modal="true" aria-label={expanded.name} onClick={() => setExpandedId(null)}>
          <article className="deck-detail" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-button deck-close" onClick={() => setExpandedId(null)} aria-label="Close">
              <X size={16} aria-hidden="true" />
            </button>
            <div className="deck-detail-visual">
              {expanded.kind === "theme" ? (
                <ThemePreview themeKey={expanded.id.replace(/^theme_/, "")} />
              ) : (
                <div className="deck-detail-icon">
                  {(() => {
                    const Icon = KIND_ICON[expanded.kind];
                    return <Icon size={56} aria-hidden="true" />;
                  })()}
                </div>
              )}
            </div>
            <div className="deck-detail-body">
              <strong className="font-display deck-detail-name">{expanded.name}</strong>
              <p className="muted" style={{ margin: 0 }}>{detail(expanded).how}</p>
              <p className="deck-math font-mono">{detail(expanded).math}</p>
              {expanded.kind !== "theme" ? (
                <span className="font-mono muted">Owned: {expanded.kind === "freeze" ? shop?.freezesOwned ?? 0 : shop?.hintsOwned ?? 0}</span>
              ) : null}
              <div className="deck-detail-foot">
                <span className="font-mono shop-price"><Coins size={15} aria-hidden="true" /> {expanded.price}</span>
                <ActionButton item={expanded} />
              </div>
            </div>
          </article>
        </div>
      ) : null}

      <AchievementToast achievements={unlocked} />
    </section>
  );
}
