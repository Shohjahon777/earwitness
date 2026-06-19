import type {
  Channel,
  DailyAnswer,
  DailyResultPayload,
  Dimension,
  LeaderboardRow,
  Me,
  Mode,
  Pick,
  Round,
  ShareCardData,
  ShopPurchaseResult,
  StackConfig,
  VoteResult
} from "./types";
import { readMockFlag } from "./mock-flags";

const audio = ["/audio/channel-a", "/audio/channel-b", "/audio/human"];

export const stacks: StackConfig[] = [
  {
    id: "premium",
    name: "Premium",
    stt: "Deepgram Nova-3",
    llm: "GPT-4o",
    tts: "ElevenLabs",
    turns: "barge-in: yes"
  },
  {
    id: "fast-cheap",
    name: "Fast/cheap",
    stt: "Whisper tiny",
    llm: "GPT-4.1 mini",
    tts: "Cartesia Sonic",
    turns: "barge-in: limited"
  },
  {
    id: "pretty-rude",
    name: "Pretty-but-rude",
    stt: "AssemblyAI",
    llm: "Claude Haiku",
    tts: "PlayHT",
    turns: "talks over"
  },
  {
    id: "robust",
    name: "Robust",
    stt: "Deepgram enhanced",
    llm: "GPT-5 mini",
    tts: "OpenAI voice",
    turns: "yielding"
  },
  {
    id: "local",
    name: "Local-baseline",
    stt: "Vosk",
    llm: "Llama local",
    tts: "Piper",
    turns: "push-to-talk"
  },
  {
    id: "human",
    name: "Human agent",
    stt: "Ear",
    llm: "Working memory",
    tts: "Live voice",
    turns: "natural pauses",
    isHuman: true
  }
];

const scenarios = [
  {
    id: "interrupt",
    label: "Customer interrupts",
    insight: "B had the nicer voice but talked over the customer. Good agents yield."
  },
  {
    id: "pause",
    label: "Long pause after price shock",
    insight: "The better stack left space, then answered with context instead of rushing."
  },
  {
    id: "accent",
    label: "Noisy accented caller",
    insight: "Robust speech recognition mattered more than the prettiest voice here."
  },
  {
    id: "clean",
    label: "Clean booking call",
    insight: "When the audio is easy, turn handling and timing decide the winner."
  }
];

let pointer = 0;
let dailySubmitted = false;
let session = {
  accuracy: 68,
  streak: 3,
  votes: 24
};

// In-memory gamification state for mock mode (no DB).
const mockEconomy = {
  coins: 320,
  xp: 540,
  loginStreak: 4,
  longestLoginStreak: 9,
  freezesOwned: 1,
  hintsOwned: 2,
  theme: "booth",
  ownedThemes: ["booth", "amber"] as string[],
  earRating: 1532,
  earRd: 140,
  bonusDry: 2
};

function mockEar() {
  return { rating: Math.round(mockEconomy.earRating), rd: Math.round(mockEconomy.earRd), ci: Math.round(1.96 * mockEconomy.earRd) };
}

const MOCK_RANKS = [
  { name: "Static", at: 0 },
  { name: "Tuned Ear", at: 100 },
  { name: "Sharp Ear", at: 300 },
  { name: "Keen Ear", at: 600 },
  { name: "Golden Ear", at: 1000 },
  { name: "Platinum Ear", at: 1600 },
  { name: "Perfect Pitch", at: 2500 }
];

function mockRank(xp: number) {
  let i = 0;
  for (let k = 0; k < MOCK_RANKS.length; k += 1) if (xp >= MOCK_RANKS[k].at) i = k;
  const cur = MOCK_RANKS[i];
  const next = MOCK_RANKS[i + 1] ?? null;
  const xpInto = xp - cur.at;
  const xpForNext = next ? next.at - cur.at : null;
  return { level: i + 1, rank: cur.name, xp, xpInto, xpForNext, progress: next ? Math.min(1, xpInto / (next.at - cur.at)) : 1 };
}

const MOCK_SHOP_ITEMS = [
  { id: "theme_amber", name: "Amber VU", desc: "Warm broadcast amber across the booth.", price: 200, kind: "theme" as const },
  { id: "theme_mono", name: "Monochrome", desc: "Stripped-back greyscale instrument look.", price: 200, kind: "theme" as const },
  { id: "theme_aurora", name: "Aurora", desc: "Cool teal-violet signal glow.", price: 250, kind: "theme" as const },
  { id: "freeze", name: "Streak freeze", desc: "Protects your login streak through one missed day.", price: 150, kind: "freeze" as const },
  { id: "hint", name: "Hint credit", desc: "Reveal the tell before a golden-ears vote.", price: 60, kind: "hint" as const }
];

const MOCK_QUESTS = [
  { id: "vote10", label: "Vote in 10 rounds", progress: 6, target: 10, claimed: false, coins: 30, xp: 20 },
  { id: "ge3", label: "Spot 3 humans", progress: 2, target: 3, claimed: false, coins: 40, xp: 30 },
  { id: "daily", label: "Play today's daily challenge", progress: 0, target: 1, claimed: false, coins: 50, xp: 40 }
];

const MOCK_ACHIEVEMENTS = [
  { id: "first_vote", label: "First listen", desc: "Cast your first vote.", coins: 20, xp: 10, unlocked: true },
  { id: "votes_10", label: "Warming up", desc: "Cast 10 votes.", coins: 30, xp: 20, unlocked: true },
  { id: "streak_5", label: "On a roll", desc: "Reach a 5 golden-ears streak.", coins: 35, xp: 25, unlocked: false },
  { id: "rank_golden", label: "Golden ear", desc: "Reach the Golden Ear rank.", coins: 100, xp: 0, unlocked: false },
  { id: "first_purchase", label: "Spender", desc: "Buy something in the shop.", coins: 15, xp: 10, unlocked: false },
  { id: "daily_perfect", label: "Flawless", desc: "Score 5/5 in a daily challenge.", coins: 90, xp: 60, unlocked: false }
];

function unlockMockAchievement(id: string) {
  const achievement = MOCK_ACHIEVEMENTS.find((item) => item.id === id);
  if (!achievement || achievement.unlocked) return undefined;
  achievement.unlocked = true;
  mockEconomy.coins += achievement.coins;
  mockEconomy.xp += achievement.xp;
  return { ...achievement };
}

function advanceMockQuest(id: string, amount = 1) {
  const quest = MOCK_QUESTS.find((item) => item.id === id);
  if (!quest || quest.claimed) return undefined;
  quest.progress = Math.min(quest.target, quest.progress + amount);
  if (quest.progress >= quest.target) {
    quest.claimed = true;
    mockEconomy.coins += quest.coins;
    mockEconomy.xp += quest.xp;
    return { ...quest, completed: true };
  }
  return { ...quest, completed: false };
}

function mockFlag() {
  return typeof window === "undefined" ? null : readMockFlag();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function latency() {
  await sleep(mockFlag() === "loading" ? 1200 : 280 + Math.random() * 220);
}

function maybeFail(scope = "mock request") {
  if (mockFlag() === "error") {
    throw new Error(`${scope} failed. Use the retry action to request the mock again.`);
  }
}

function makeClip(roundIndex: number, channel: Channel, stack: StackConfig, mode: Mode) {
  const audioIndex = stack.isHuman ? 2 : channel === "A" ? 0 : 1;
  return {
    id: `${mode}-${roundIndex}-${channel}-${stack.id}`,
    url: audio[audioIndex],
    durationSec: stack.isHuman ? 15 : channel === "A" ? 14 : 16,
    stack
  };
}

function makeRound(mode: Mode, index = pointer): Round {
  const scenario = scenarios[index % scenarios.length];

  if (mode === "golden-ears") {
    const humanOnA = index % 2 === 0;
    const aiStack = stacks[(index + 2) % 5];
    return {
      id: `golden-${index}`,
      mode,
      scenario: {
        ...scenario,
        insight:
          humanOnA
            ? "The human paused to think at 0:06 before repairing the interruption."
            : "The human left a small breath before changing direction at 0:08."
      },
      clipA: makeClip(index, "A", humanOnA ? stacks[5] : aiStack, mode),
      clipB: makeClip(index, "B", humanOnA ? aiStack : stacks[5], mode)
    };
  }

  return {
    id: `arena-${index}`,
    mode,
    scenario,
    clipA: makeClip(index, "A", stacks[index % 5], mode),
    clipB: makeClip(index, "B", stacks[(index + 2) % 5], mode)
  };
}

function findRound(roundId: string): Round {
  const [, rawIndex] = roundId.split("-");
  const index = Number(rawIndex) || 0;
  return makeRound(roundId.startsWith("golden") ? "golden-ears" : "arena", index);
}

function humanChannel(round: Round): Channel | null {
  if (round.clipA.stack.isHuman) return "A";
  if (round.clipB.stack.isHuman) return "B";
  return null;
}

export async function getRound(mode: Mode): Promise<Round> {
  await latency();
  maybeFail("Round");

  if (mockFlag() === "empty") {
    throw new Error("No matchups right now. Check the leaderboard while we cook more.");
  }

  const round = makeRound(mode, pointer);
  pointer += 1;
  return round;
}

export async function submitVote(roundId: string, pick: Pick): Promise<VoteResult> {
  await latency();
  maybeFail("Vote");

  const round = findRound(roundId);
  const correctChannel = humanChannel(round);
  const isGolden = round.mode === "golden-ears";
  const correct = isGolden ? pick === correctChannel : undefined;

  session.votes += 1;
  if (isGolden) {
    session.streak = correct ? session.streak + 1 : 0;
    const correctVotes = Math.round((session.accuracy / 100) * (session.votes - 1));
    const nextCorrect = correctVotes + (correct ? 1 : 0);
    session.accuracy = Math.round((nextCorrect / session.votes) * 100);
  }

  // Mock economy: deterministic-ish reward so the UI's reward moment is exercised.
  const rankBefore = mockRank(mockEconomy.xp);
  const bonus = session.votes % 4 === 0;
  const baseCoins = isGolden ? (correct ? 12 : 1) : pick === "tie" ? 2 : 5;
  const coins = bonus ? baseCoins * 2 : baseCoins;
  const xp = isGolden ? (correct ? 15 : 3) : 8;
  const jackpot = isGolden && correct && session.streak % 5 === 0 ? 25 : 0;
  mockEconomy.coins += coins + jackpot;
  mockEconomy.xp += xp;
  const questsProgressed = [advanceMockQuest("vote10"), isGolden && correct ? advanceMockQuest("ge3") : undefined].filter(Boolean) as NonNullable<
    VoteResult["questsProgressed"]
  >;
  const achievementsUnlocked = [
    unlockMockAchievement("first_vote"),
    session.votes >= 10 ? unlockMockAchievement("votes_10") : undefined,
    session.streak >= 5 ? unlockMockAchievement("streak_5") : undefined,
    mockRank(mockEconomy.xp).rank === "Golden Ear" ? unlockMockAchievement("rank_golden") : undefined,
  ].filter(Boolean) as NonNullable<VoteResult["achievementsUnlocked"]>;
  const rank = mockRank(mockEconomy.xp);

  return {
    recorded: mockFlag() !== "offline",
    winnerChannel: pick,
    correct,
    reveal: {
      A: round.clipA.stack,
      B: round.clipB.stack,
      insight: round.scenario.insight
    },
    session: { ...session },
    reward: { coins, xp, bonus, jackpot },
    rank,
    levelUp: rank.level > rankBefore.level ? { level: rank.level, rank: rank.rank } : undefined,
    questsProgressed,
    achievementsUnlocked,
    coinsTotal: mockEconomy.coins,
    xpTotal: mockEconomy.xp,
    ear: mockEar(),
    signalBits: isGolden ? xp : undefined,
    bonusOdds: Math.min(1, 0.12 + 0.08 * mockEconomy.bonusDry)
  };
}

export async function getDaily(): Promise<{
  rounds: Round[];
  alreadyDone: boolean;
  resetsAt: string;
}> {
  await latency();
  maybeFail("Daily challenge");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return {
    rounds: Array.from({ length: 5 }, (_, index) => makeRound("golden-ears", index)),
    alreadyDone: dailySubmitted || mockFlag() === "done",
    resetsAt: tomorrow.toISOString()
  };
}

export async function submitDaily(
  answers: DailyAnswer[]
): Promise<DailyResultPayload> {
  await latency();
  maybeFail("Daily submission");
  dailySubmitted = true;
  const score = answers.filter((answer) => answer.correct).length;
  const rankBefore = mockRank(mockEconomy.xp);
  const dailyQuest = advanceMockQuest("daily");
  let coinsEarned = 20 + score * 10 + (dailyQuest?.completed ? dailyQuest.coins : 0);
  let xpEarned = 15 + score * 8 + (dailyQuest?.completed ? dailyQuest.xp : 0);
  mockEconomy.coins += 20 + score * 10;
  mockEconomy.xp += 15 + score * 8;
  const perfect = score === 5 ? unlockMockAchievement("daily_perfect") : undefined;
  if (perfect) {
    coinsEarned += perfect.coins;
    xpEarned += perfect.xp;
  }
  const rank = mockRank(mockEconomy.xp);
  return {
    score,
    percentile: Math.min(96, 42 + score * 11),
    shareId: "daily-7f2",
    coinsEarned,
    xpEarned,
    levelUp: rank.level > rankBefore.level ? { level: rank.level, rank: rank.rank } : undefined,
    achievementsUnlocked: perfect ? [perfect] : undefined
  };
}

const baseRows: LeaderboardRow[] = [
  { rank: 1, stack: stacks[3], rating: 1218, ratingCI: 12, votes: 4280, trend: [9, 11, 13, 12, 15, 18, 21], naturalness: 1188, interaction: 1242 },
  { rank: 2, stack: stacks[0], rating: 1182, ratingCI: 14, votes: 3920, trend: [12, 13, 12, 16, 17, 17, 19], naturalness: 1215, interaction: 1149 },
  { rank: 3, stack: stacks[2], rating: 1140, ratingCI: 18, votes: 2440, trend: [18, 19, 18, 17, 15, 13, 12], naturalness: 1236, interaction: 1010 },
  { rank: 4, stack: stacks[1], rating: 1098, ratingCI: 20, votes: 2114, trend: [8, 9, 10, 10, 11, 11, 12], naturalness: 1102, interaction: 1068 },
  { rank: 5, stack: stacks[4], rating: 984, ratingCI: 26, votes: 1038, trend: [15, 13, 12, 11, 9, 8, 7], naturalness: 970, interaction: 998 }
];

export async function getLeaderboard(dim: Dimension): Promise<LeaderboardRow[]> {
  await latency();
  maybeFail("Leaderboard");
  if (mockFlag() === "empty") return [];

  return [...baseRows]
    .sort((a, b) => {
      const aScore = dim === "overall" ? a.rating : a[dim] ?? a.rating;
      const bScore = dim === "overall" ? b.rating : b[dim] ?? b.rating;
      return bScore - aScore;
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      rating: dim === "overall" ? row.rating : row[dim] ?? row.rating
    }));
}

export async function getListeners(): Promise<Me[]> {
  await latency();
  maybeFail("Listeners");
  if (mockFlag() === "empty") return [];

  return [
    { sessionId: "me", handle: "Listener-7F2", accuracy: session.accuracy, streak: session.streak, longestStreak: 11, votes: session.votes, dailyDone: dailySubmitted, dailyScore: 4 },
    { sessionId: "a41", handle: "Listener-A41", accuracy: 91, streak: 8, longestStreak: 19, votes: 141, dailyDone: true, dailyScore: 5 },
    { sessionId: "c09", handle: "Listener-C09", accuracy: 86, streak: 4, longestStreak: 14, votes: 98, dailyDone: true, dailyScore: 4 },
    { sessionId: "3be", handle: "Listener-3BE", accuracy: 79, streak: 2, longestStreak: 9, votes: 76, dailyDone: false, dailyScore: 3 },
    { sessionId: "19d", handle: "Listener-19D", accuracy: 74, streak: 6, longestStreak: 10, votes: 63, dailyDone: true, dailyScore: 4 }
  ];
}

export async function getMe(): Promise<Me> {
  await latency();
  return {
    sessionId: "me",
    handle: "Listener-7F2",
    accuracy: session.accuracy,
    streak: session.streak,
    votes: session.votes,
    dailyDone: dailySubmitted || mockFlag() === "done",
    longestStreak: 11,
    dailyScore: 4,
    coins: mockEconomy.coins,
    rank: mockRank(mockEconomy.xp),
    loginStreak: mockEconomy.loginStreak,
    longestLoginStreak: mockEconomy.longestLoginStreak,
    freezesOwned: mockEconomy.freezesOwned,
    hintsOwned: mockEconomy.hintsOwned,
    theme: mockEconomy.theme,
    ownedThemes: [...mockEconomy.ownedThemes],
    quests: MOCK_QUESTS.map((q) => ({ ...q })),
    achievements: MOCK_ACHIEVEMENTS.map((a) => ({ ...a })),
    ear: mockEar()
  };
}

export async function getSystemStats(): Promise<import("./types").SystemStats> {
  await latency();
  const sources = [
    { source: "vote", total: 1840 },
    { source: "bonus", total: 420 },
    { source: "jackpot", total: 150 },
    { source: "quest", total: 360 },
    { source: "achievement", total: 240 },
    { source: "login", total: 180 },
    { source: "daily", total: 220 }
  ];
  const sinks = [{ source: "purchase", total: 600 }];
  const minted = sources.reduce((n, s) => n + s.total, 0);
  const burned = sinks.reduce((n, s) => n + s.total, 0);
  const hard = 10;
  return {
    economy: { sources, sinks, minted, burned, circulating: minted - burned },
    ear: {
      buckets: [
        { label: "<1300", count: 2 },
        { label: "1300–1400", count: 5 },
        { label: "1400–1500", count: 11 },
        { label: "1500–1600", count: 14 },
        { label: "1600–1700", count: 6 },
        { label: "1700+", count: 3 }
      ],
      avgRd: 132,
      players: 41
    },
    config: {
      ranks: [
        { name: "Static", at: 0 },
        { name: "Tuned Ear", at: 100 },
        { name: "Sharp Ear", at: 300 },
        { name: "Keen Ear", at: 600 },
        { name: "Golden Ear", at: 1000 },
        { name: "Platinum Ear", at: 1600 },
        { name: "Perfect Pitch", at: 2500 }
      ],
      pity: { base: 0.12, step: 0.08, hard },
      pityCurve: Array.from({ length: hard + 1 }, (_, d) => Number(Math.min(1, 0.12 + 0.08 * d).toFixed(3))),
      earn: { arenaCoins: 5, geCorrectCoins: 10, signalBitsBase: 6, jackpotCoins: 25 }
    }
  };
}

function buildMockShop(): import("./types").Shop {
  return {
    coins: mockEconomy.coins,
    freezesOwned: mockEconomy.freezesOwned,
    hintsOwned: mockEconomy.hintsOwned,
    items: MOCK_SHOP_ITEMS.map((item) => {
      const themeKey = item.kind === "theme" ? item.id.replace(/^theme_/, "") : undefined;
      return {
        ...item,
        owned: item.kind === "theme" ? mockEconomy.ownedThemes.includes(themeKey!) : false,
        equipped: item.kind === "theme" ? mockEconomy.theme === themeKey : undefined
      };
    })
  };
}

export async function getShop(): Promise<import("./types").Shop> {
  await latency();
  maybeFail("Shop");
  return buildMockShop();
}

export async function purchaseItem(itemId: string): Promise<ShopPurchaseResult> {
  await latency();
  const item = MOCK_SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) throw new Error("No such item.");
  if (mockEconomy.coins < item.price) throw new Error("Not enough coins.");
  mockEconomy.coins -= item.price;
  if (item.kind === "theme") {
    const key = item.id.replace(/^theme_/, "");
    if (!mockEconomy.ownedThemes.includes(key)) mockEconomy.ownedThemes.push(key);
  } else if (item.kind === "freeze") {
    mockEconomy.freezesOwned += 1;
  } else if (item.kind === "hint") {
    mockEconomy.hintsOwned += 1;
  }
  const firstPurchase = unlockMockAchievement("first_purchase");
  return { ...buildMockShop(), achievementsUnlocked: firstPurchase ? [firstPurchase] : undefined };
}

export async function equipTheme(theme: string): Promise<{ theme: string; ownedThemes: string[] }> {
  await latency();
  if (!mockEconomy.ownedThemes.includes(theme)) throw new Error("Theme not owned.");
  mockEconomy.theme = theme;
  return { theme, ownedThemes: [...mockEconomy.ownedThemes] };
}

export async function spendHint(_roundId: string): Promise<{ tell: string; hintsOwned: number }> {
  await latency();
  if (mockEconomy.hintsOwned < 1) throw new Error("No hint credits. Buy one in the shop.");
  mockEconomy.hintsOwned -= 1;
  return { tell: "Listen for a natural breath or a beat of hesitation before the reply.", hintsOwned: mockEconomy.hintsOwned };
}

export async function getShareCard(id: string): Promise<ShareCardData> {
  await latency();
  maybeFail("Share card");

  const isDaily = id.includes("daily");
  const stats = {
    id,
    handle: "Listener-7F2",
    accuracy: isDaily ? 87 : session.accuracy,
    score: isDaily ? 4 : undefined,
    percentile: isDaily ? 78 : undefined,
    streak: session.streak,
    mode: isDaily ? "daily" : "golden-ears"
  } as const;

  return {
    stats,
    tagline: isDaily
      ? "I scored 4/5 in today's golden-ears challenge."
      : `I've got golden ears: ${stats.accuracy}% AI-detection.`
  };
}

export function correctChannelForRound(round: Round): Channel | null {
  return humanChannel(round);
}
