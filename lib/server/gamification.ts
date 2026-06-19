import "server-only";
/**
 * Single source of truth for the Earwitness economy: ranks, earning, quests, achievements,
 * shop, and daily-login math. Everything here is PURE (no DB) — it takes plain snapshots and
 * returns plain deltas. lib/server/data.ts persists those deltas inside its transactions.
 *
 * Theme: coins = "credits", xp = "signal", levels = Ear Ranks.
 */

// ---------------------------------------------------------------- ranks
export interface Rank {
  level: number;
  rank: string;
  xpInto: number; // xp earned past the current rank threshold
  xpForNext: number | null; // xp span to the next rank (null at max)
  progress: number; // 0..1 toward next rank
  xp: number;
}

// Ascending xp thresholds. Top rank is terminal.
const RANKS: { name: string; at: number }[] = [
  { name: "Static", at: 0 },
  { name: "Tuned Ear", at: 100 },
  { name: "Sharp Ear", at: 300 },
  { name: "Keen Ear", at: 600 },
  { name: "Golden Ear", at: 1000 },
  { name: "Platinum Ear", at: 1600 },
  { name: "Perfect Pitch", at: 2500 },
];

export function ranksTable(): { name: string; at: number }[] {
  return RANKS.map((r) => ({ ...r }));
}

export function levelForXp(xp: number): Rank {
  let i = 0;
  for (let k = 0; k < RANKS.length; k += 1) if (xp >= RANKS[k].at) i = k;
  const cur = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const xpInto = xp - cur.at;
  const xpForNext = next ? next.at - cur.at : null;
  const progress = next ? Math.min(1, xpInto / (next.at - cur.at)) : 1;
  return { level: i + 1, rank: cur.name, xpInto, xpForNext, progress, xp };
}

// ---------------------------------------------------------------- earning
export const EARN = {
  arenaCoins: 5,
  arenaXp: 8,
  tieCoins: 2,
  tieXp: 3,
  geCorrectCoins: 10,
  geCorrectXp: 15,
  geWrongCoins: 1,
  geWrongXp: 3,
  signalBonusChance: 0.12, // base 2× chance (the dopamine driver) — see PITY for the real curve
  jackpotEvery: 5, // streak milestone
  jackpotCoins: 25,
  // information-theoretic "signal" (XP) for golden-ears: bits × this
  signalBitsBase: 6,
  signalWrongFactor: 0.25, // consolation signal on a miss
  signalMin: 3,
  signalMax: 60,
};

// --- pity timer (soft bad-luck protection) for the 2× signal bonus ---
// P(bonus) starts at EARN.signalBonusChance and rises by `step` per dry vote, guaranteed by `hard`.
export const PITY = {
  base: EARN.signalBonusChance,
  step: 0.08,
  hard: 10, // guaranteed bonus once dryStreak reaches this
};

export function bonusOdds(dryStreak: number): number {
  if (dryStreak >= PITY.hard) return 1;
  return Math.min(1, PITY.base + PITY.step * dryStreak);
}

export interface BonusRoll {
  bonus: boolean;
  nextDry: number; // dryStreak to persist after this vote
  odds: number; // probability used for this roll (for UI/telemetry)
}

// Decide the 2× bonus with the pity curve. Forced on via EW_FORCE_BONUS for testing.
export function rollBonus(dryStreak: number): BonusRoll {
  const odds = bonusOdds(dryStreak);
  const forced = process.env.EW_FORCE_BONUS === "1";
  const bonus = forced || dryStreak >= PITY.hard || Math.random() < odds;
  return { bonus, nextDry: bonus ? 0 : dryStreak + 1, odds };
}

// Information-theoretic "signal": Shannon surprisal of the outcome given the expected win prob E.
// Spotting a deceptive (low-E) human pays more bits than an easy one. E is clamped off 0/1.
export function signalBits(E: number, correct: boolean): number {
  const e = Math.min(0.999, Math.max(0.001, E));
  const bits = correct ? -Math.log2(e) : -Math.log2(1 - e) * EARN.signalWrongFactor;
  const xp = Math.round(EARN.signalBitsBase * bits);
  return Math.min(EARN.signalMax, Math.max(EARN.signalMin, xp));
}

// Coin faucets (earned) and sinks (spent) — labels for the /system economy panel.
export const COIN_SOURCES = ["vote", "bonus", "jackpot", "quest", "achievement", "login", "daily"] as const;
export const COIN_SINKS = ["purchase"] as const;
export type CoinSource = (typeof COIN_SOURCES)[number] | (typeof COIN_SINKS)[number];

export interface VoteRewardCtx {
  mode: "arena" | "golden-ears";
  pick: "A" | "B" | "tie";
  correct?: boolean;
  streakAfter: number;
}

export interface VoteReward {
  coins: number;
  xp: number;
  bonus: boolean; // signal-bonus 2× hit
  jackpot: number; // streak-milestone coins
  multiplier: number; // streak multiplier applied to GE-correct
}

// Streak multiplier for golden-ears correct: +10% per streak step, capped at 2×.
function streakMultiplier(streak: number) {
  return 1 + Math.min(Math.max(streak, 0), 10) * 0.1;
}

export interface VoteRewardOpts {
  bonus: boolean; // decided by the pity timer (rollBonus) in the caller
  xpOverride?: number; // info-theoretic "signal" for golden-ears (signalBits)
}

export function rollVoteReward(ctx: VoteRewardCtx, opts: VoteRewardOpts): VoteReward {
  let coins = 0;
  let xp = 0;
  let multiplier = 1;

  if (ctx.mode === "golden-ears") {
    if (ctx.correct) {
      multiplier = streakMultiplier(ctx.streakAfter);
      coins = Math.round(EARN.geCorrectCoins * multiplier);
      xp = Math.round(EARN.geCorrectXp * multiplier);
    } else {
      coins = EARN.geWrongCoins;
      xp = EARN.geWrongXp;
    }
  } else if (ctx.pick === "tie") {
    coins = EARN.tieCoins;
    xp = EARN.tieXp;
  } else {
    coins = EARN.arenaCoins;
    xp = EARN.arenaXp;
  }

  // Golden-ears XP is information-theoretic (signalBits); arena keeps the flat curve.
  if (opts.xpOverride !== undefined) xp = opts.xpOverride;

  // Variable-ratio "signal bonus" (pity-timed by the caller): doubles coins.
  if (opts.bonus) coins *= 2;

  // Streak-milestone jackpot (golden-ears correct only).
  let jackpot = 0;
  if (ctx.mode === "golden-ears" && ctx.correct && ctx.streakAfter > 0 && ctx.streakAfter % EARN.jackpotEvery === 0) {
    jackpot = EARN.jackpotCoins;
    coins += jackpot;
  }

  return { coins, xp, bonus: opts.bonus, jackpot, multiplier };
}

// ---------------------------------------------------------------- quests
export type QuestKind = "votes" | "arenaVotes" | "geCorrect" | "streakReach" | "daily";

export interface QuestDef {
  id: string;
  label: string;
  target: number;
  kind: QuestKind;
  coins: number;
  xp: number;
}

const QUEST_POOL: QuestDef[] = [
  { id: "vote10", label: "Vote in 10 rounds", target: 10, kind: "votes", coins: 30, xp: 20 },
  { id: "vote20", label: "Vote in 20 rounds", target: 20, kind: "votes", coins: 60, xp: 40 },
  { id: "arena5", label: "Judge 5 arena matchups", target: 5, kind: "arenaVotes", coins: 25, xp: 20 },
  { id: "ge3", label: "Spot 3 humans", target: 3, kind: "geCorrect", coins: 40, xp: 30 },
  { id: "streak5", label: "Hit a 5-streak", target: 5, kind: "streakReach", coins: 35, xp: 25 },
  { id: "daily", label: "Play today's daily challenge", target: 1, kind: "daily", coins: 50, xp: 40 },
];

// Deterministic 3 quests per UTC day — same for everyone.
export function todaysQuests(date: string): QuestDef[] {
  const rng = seeded(date);
  const pool = [...QUEST_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function questDef(id: string): QuestDef | undefined {
  return QUEST_POOL.find((q) => q.id === id);
}

// How much a single vote advances a quest of this kind.
export function questDelta(def: QuestDef, ctx: VoteRewardCtx): number | "set" {
  switch (def.kind) {
    case "votes":
      return 1;
    case "arenaVotes":
      return ctx.mode === "arena" ? 1 : 0;
    case "geCorrect":
      return ctx.mode === "golden-ears" && ctx.correct ? 1 : 0;
    case "streakReach":
      return "set"; // progress = max(progress, streakAfter)
    case "daily":
      return 0; // advanced by submitDaily, not per-vote
  }
}

// ---------------------------------------------------------------- achievements
export interface AchievementDef {
  id: string;
  label: string;
  desc: string;
  coins: number;
  xp: number;
}

export interface AchievementSnapshot {
  votes: number;
  longestStreak: number;
  level: number;
  loginStreak: number;
  firstPurchase: boolean;
  dailyPerfect: boolean;
}

const ACHIEVEMENTS: { def: AchievementDef; test: (s: AchievementSnapshot) => boolean }[] = [
  { def: { id: "first_vote", label: "First listen", desc: "Cast your first vote.", coins: 20, xp: 10 }, test: (s) => s.votes >= 1 },
  { def: { id: "votes_10", label: "Warming up", desc: "Cast 10 votes.", coins: 30, xp: 20 }, test: (s) => s.votes >= 10 },
  { def: { id: "votes_50", label: "Seasoned ear", desc: "Cast 50 votes.", coins: 60, xp: 50 }, test: (s) => s.votes >= 50 },
  { def: { id: "votes_100", label: "Centurion", desc: "Cast 100 votes.", coins: 120, xp: 100 }, test: (s) => s.votes >= 100 },
  { def: { id: "streak_5", label: "On a roll", desc: "Reach a 5 golden-ears streak.", coins: 35, xp: 25 }, test: (s) => s.longestStreak >= 5 },
  { def: { id: "streak_10", label: "Sharp", desc: "Reach a 10 streak.", coins: 70, xp: 50 }, test: (s) => s.longestStreak >= 10 },
  { def: { id: "streak_25", label: "Uncanny", desc: "Reach a 25 streak.", coins: 200, xp: 150 }, test: (s) => s.longestStreak >= 25 },
  { def: { id: "rank_golden", label: "Golden ear", desc: "Reach the Golden Ear rank.", coins: 100, xp: 0 }, test: (s) => s.level >= 5 },
  { def: { id: "login_7", label: "Regular", desc: "Keep a 7-day login streak.", coins: 80, xp: 40 }, test: (s) => s.loginStreak >= 7 },
  { def: { id: "first_purchase", label: "Spender", desc: "Buy something in the shop.", coins: 15, xp: 10 }, test: (s) => s.firstPurchase },
  { def: { id: "daily_perfect", label: "Flawless", desc: "Score 5/5 in a daily challenge.", coins: 90, xp: 60 }, test: (s) => s.dailyPerfect },
];

export function evaluateAchievements(snapshot: AchievementSnapshot, unlocked: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.def.id) && a.test(snapshot)).map((a) => a.def);
}

export function achievementDefs(): AchievementDef[] {
  return ACHIEVEMENTS.map((a) => a.def);
}

// ---------------------------------------------------------------- shop
export type ShopKind = "theme" | "freeze" | "hint";

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: ShopKind;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "theme_amber", name: "Amber VU", desc: "Warm broadcast amber across the booth.", price: 200, kind: "theme" },
  { id: "theme_mono", name: "Monochrome", desc: "Stripped-back greyscale instrument look.", price: 200, kind: "theme" },
  { id: "theme_aurora", name: "Aurora", desc: "Cool teal-violet signal glow.", price: 250, kind: "theme" },
  { id: "freeze", name: "Streak freeze", desc: "Protects your login streak through one missed day.", price: 150, kind: "freeze" },
  { id: "hint", name: "Hint credit", desc: "Reveal the tell before a golden-ears vote.", price: 60, kind: "hint" },
];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((s) => s.id === id);
}

// theme item id ("theme_amber") → theme key ("amber")
export function themeKeyOf(item: ShopItem): string {
  return item.id.replace(/^theme_/, "");
}

export const DEFAULT_THEME = "booth";
export const ALL_THEME_KEYS = ["booth", ...SHOP_ITEMS.filter((s) => s.kind === "theme").map(themeKeyOf)];

// ---------------------------------------------------------------- daily login
// Escalating coin bonus by login-streak day (capped at day 7+).
const LOGIN_BONUS = [0, 10, 15, 20, 25, 30, 40, 60];

export interface LoginInput {
  lastLoginDate: string | null;
  loginStreak: number;
  longestLoginStreak: number;
  freezesOwned: number;
}

export interface LoginResult {
  claimed: boolean; // false if already claimed today
  coins: number;
  newStreak: number;
  longestLoginStreak: number;
  freezeUsed: boolean;
  date: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86400000);
}

// Pure login-streak math. Returns deltas; caller persists.
export function resolveLoginBonus(input: LoginInput, today: string): LoginResult {
  if (input.lastLoginDate === today) {
    return {
      claimed: false,
      coins: 0,
      newStreak: input.loginStreak,
      longestLoginStreak: input.longestLoginStreak,
      freezeUsed: false,
      date: today,
    };
  }

  let newStreak: number;
  let freezeUsed = false;

  if (!input.lastLoginDate) {
    newStreak = 1;
  } else {
    const gap = dayDiff(input.lastLoginDate, today);
    if (gap === 1) {
      newStreak = input.loginStreak + 1;
    } else if (gap === 2 && input.freezesOwned > 0) {
      newStreak = input.loginStreak + 1; // a freeze bridges a single missed day
      freezeUsed = true;
    } else {
      newStreak = 1; // streak broke
    }
  }

  const coins = LOGIN_BONUS[Math.min(newStreak, LOGIN_BONUS.length - 1)];
  return {
    claimed: true,
    coins,
    newStreak,
    longestLoginStreak: Math.max(input.longestLoginStreak, newStreak),
    freezeUsed,
    date: today,
  };
}

export function loginBonusPreview(): number[] {
  return LOGIN_BONUS.slice(1); // day 1..7 schedule for the UI strip
}

export function todayUtc(): string {
  return ymd(new Date());
}

// ---------------------------------------------------------------- util
function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
