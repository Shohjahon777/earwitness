export type Channel = "A" | "B";
export type Pick = Channel | "tie";
export type Mode = "arena" | "golden-ears";
export type Dimension = "overall" | "naturalness" | "interaction";

export interface StackConfig {
  id: string;
  name: string;
  stt: string;
  llm: string;
  tts: string;
  turns: string;
  isHuman?: boolean;
}

// One spoken turn in a clip. Speaker is neutral (caller/agent) so showing it pre-vote can't
// reveal which stack a clip is — the words are already audible; this is just synced captions.
export interface CaptionSegment {
  speaker: "caller" | "agent";
  start: number;
  end: number;
  text: string;
}

export interface Clip {
  id: string;
  url: string;
  durationSec: number;
  stack: StackConfig;
  caption?: CaptionSegment[];
}

export interface Scenario {
  id: string;
  label: string;
  insight: string;
}

export interface Round {
  id: string;
  mode: Mode;
  scenario: Scenario;
  clipA: Clip;
  clipB: Clip;
}

export interface VoteResult {
  recorded: boolean;
  winnerChannel: Pick;
  correct?: boolean;
  shareId?: string;
  // outcomeA/outcomeB: the turn-handling verdict per channel ("yielded to the caller",
  // "talked over the caller", …) — the payoff line shown only after voting.
  reveal: { A: StackConfig; B: StackConfig; insight: string; outcomeA?: string; outcomeB?: string };
  session: { accuracy: number; streak: number; votes: number };
  // --- gamification (additive; absent in mock-less/legacy paths) ---
  reward?: VoteReward;
  rank?: RankInfo;
  levelUp?: { level: number; rank: string };
  questsProgressed?: QuestProgressEvent[];
  achievementsUnlocked?: AchievementView[];
  coinsTotal?: number;
  xpTotal?: number;
  // --- Ear Engine ---
  ear?: EarInfo; // user's Glicko ear rating after this vote
  signalBits?: number; // information-theoretic XP granted (golden-ears)
  bonusOdds?: number; // pity-timer probability used for this vote's 2× roll
}

// ---- gamification view types ----
export interface VoteReward {
  coins: number;
  xp: number;
  bonus: boolean; // signal-bonus 2× hit
  jackpot: number; // streak-milestone coins
}

export interface EarInfo {
  rating: number; // Glicko-2 rating of the user's "ear" (~1500 scale)
  rd: number; // rating deviation (uncertainty)
  ci: number; // ±confidence interval in rating points
}

export interface RankInfo {
  level: number;
  rank: string;
  xp: number;
  xpInto: number;
  xpForNext: number | null;
  progress: number; // 0..1 toward next rank
}

export interface QuestView {
  id: string;
  label: string;
  progress: number;
  target: number;
  claimed: boolean;
  coins: number;
  xp: number;
}

export interface QuestProgressEvent extends QuestView {
  completed: boolean; // completed on THIS action
}

export interface AchievementView {
  id: string;
  label: string;
  desc: string;
  coins: number;
  xp: number;
  unlocked: boolean;
  unlockedAt?: string;
}

export type ShopKind = "theme" | "freeze" | "hint";

export interface ShopItemView {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: ShopKind;
  owned: boolean; // themes: bought; consumables: always purchasable
  equipped?: boolean; // themes only
}

export interface LoginReward {
  coins: number;
  newStreak: number;
  schedule: number[]; // day 1..7 escalating bonus for the UI strip
  freezeUsed: boolean;
}

export interface Shop {
  coins: number;
  items: ShopItemView[];
  freezesOwned: number;
  hintsOwned: number;
}

export interface ShopPurchaseResult extends Shop {
  achievementsUnlocked?: AchievementView[];
}

export interface DailyResultPayload {
  score: number;
  percentile: number;
  shareId: string;
  // real display fields (so the inline preview card matches the public /c/[id] page exactly)
  handle?: string;
  streak?: number;
  accuracy?: number;
  coinsEarned?: number;
  xpEarned?: number;
  levelUp?: { level: number; rank: string };
  achievementsUnlocked?: AchievementView[];
}

export interface LeaderboardRow {
  rank: number;
  stack: StackConfig;
  rating: number;
  ratingCI: number;
  votes: number;
  trend: number[];
  naturalness?: number;
  interaction?: number;
}

export interface Me {
  sessionId: string;
  handle: string;
  accuracy: number;
  streak: number;
  votes: number;
  dailyDone: boolean;
  longestStreak?: number;
  dailyScore?: number;
  // --- gamification profile (populated by getMe; omitted in listeners rows) ---
  coins?: number;
  rank?: RankInfo;
  loginStreak?: number;
  longestLoginStreak?: number;
  freezesOwned?: number;
  hintsOwned?: number;
  theme?: string;
  ownedThemes?: string[];
  quests?: QuestView[];
  achievements?: AchievementView[];
  loginReward?: LoginReward; // present only on the day a bonus was claimed
  ear?: EarInfo; // Glicko ear rating
}

// ---- /system live engine telemetry ----
export interface SystemStats {
  economy: {
    sources: { source: string; total: number }[]; // faucets (coins earned by source)
    sinks: { source: string; total: number }[]; // sinks (coins spent)
    minted: number; // total coins faucet
    burned: number; // total coins sink
    circulating: number; // sum of session balances
  };
  ear: {
    buckets: { label: string; count: number }[]; // ear-rating distribution
    avgRd: number; // mean uncertainty across players
    players: number;
  };
  config: {
    ranks: { name: string; at: number }[];
    pity: { base: number; step: number; hard: number };
    pityCurve: number[]; // P(bonus) for dryStreak 0..hard
    earn: Record<string, number>;
  };
}

export interface ShareStats {
  id: string;
  handle: string;
  accuracy: number;
  score?: number;
  percentile?: number;
  streak: number;
  mode: "daily" | "golden-ears" | "matchup";
}

export interface ShareCardData {
  stats: ShareStats;
  tagline: string;
}

export interface DailyAnswer {
  roundId: string;
  pick: Pick;
  correct?: boolean;
}
