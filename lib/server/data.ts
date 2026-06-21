import "server-only";
import { customAlphabet } from "nanoid";
import { prisma } from "./db";
import { applyElo, dimensionsFor } from "./ranking";
import {
  ALL_THEME_KEYS,
  achievementDefs,
  bonusOdds,
  COIN_SINKS,
  COIN_SOURCES,
  EARN,
  evaluateAchievements,
  levelForXp,
  loginBonusPreview,
  PITY,
  questDef,
  questDelta,
  ranksTable,
  resolveLoginBonus,
  rollBonus,
  rollVoteReward,
  signalBits,
  shopItem,
  SHOP_ITEMS,
  themeKeyOf,
  todaysQuests,
  type AchievementSnapshot,
  type CoinSource,
} from "./gamification";
import * as glicko from "./glicko";
import type {
  AchievementView,
  Channel,
  Clip,
  DailyAnswer,
  DailyResultPayload,
  Dimension,
  LeaderboardRow,
  Me,
  Mode,
  Pick,
  QuestProgressEvent,
  QuestView,
  RankInfo,
  Round,
  Shop,
  ShopPurchaseResult,
  ShopItemView,
  ShareCardData,
  StackConfig,
  VoteResult,
} from "../types";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  Mode as DbMode,
  Channel as DbChannel,
  Stack as DbStack,
  Clip as DbClip,
  Dimension as DbDimension,
} from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

function rankInfoFor(xp: number): RankInfo {
  const r = levelForXp(xp);
  return { level: r.level, rank: r.rank, xp: r.xp, xpInto: r.xpInto, xpForNext: r.xpForNext, progress: r.progress };
}

// ---- mode mapping (API uses "golden-ears", DB enum uses "golden_ears") ----
const toDbMode = (m: Mode): DbMode => (m === "golden-ears" ? "golden_ears" : "arena");
const fromDbMode = (m: DbMode): Mode => (m === "golden_ears" ? "golden-ears" : "arena");

const newShareId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

class NoMatchupsError extends Error {}
export function isNoMatchups(err: unknown): boolean {
  return err instanceof NoMatchupsError;
}

function toStackConfig(s: DbStack): StackConfig {
  return { id: s.id, name: s.name, stt: s.stt, llm: s.llm, tts: s.tts, turns: s.turns, isHuman: s.isHuman };
}

// Identity hidden from the client until the reveal. The UI never renders clip.stack pre-vote,
// so this is a pure integrity measure against network-inspecting cheaters.
const HIDDEN_STACK: StackConfig = { id: "hidden", name: "Hidden", stt: "—", llm: "—", tts: "—", turns: "—" };

// Pull only the neutral (speaker/timing/text) part of the cached transcript. The spoiler fields
// (stackName, outcome, bargeIn, isHuman) are deliberately dropped so captions can show pre-vote.
function captionFrom(transcript: unknown): Clip["caption"] {
  const events = (transcript as { events?: unknown })?.events;
  if (!Array.isArray(events)) return undefined;
  const caption = events
    .filter(
      (e): e is { speaker: "caller" | "agent"; start: number; end: number; text: string } =>
        !!e &&
        ((e as { speaker?: unknown }).speaker === "caller" || (e as { speaker?: unknown }).speaker === "agent") &&
        typeof (e as { text?: unknown }).text === "string"
    )
    .map((e) => ({ speaker: e.speaker, start: Number(e.start) || 0, end: Number(e.end) || 0, text: e.text }));
  return caption.length ? caption : undefined;
}

function outcomeFrom(transcript: unknown): string | undefined {
  const outcome = (transcript as { outcome?: unknown })?.outcome;
  return typeof outcome === "string" ? outcome : undefined;
}

function redactClip(clip: DbClip): Clip {
  return {
    id: clip.id,
    url: clip.blobUrl,
    durationSec: clip.durationSec,
    stack: HIDDEN_STACK,
    caption: captionFrom(clip.transcript),
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deterministic PRNG so the daily challenge is identical for everyone on a given date.
function seededRng(seed: string) {
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

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

type ScenarioWithClips = Awaited<ReturnType<typeof loadScenariosWithClips>>[number];

function loadScenariosWithClips() {
  return prisma.scenario.findMany({ include: { clips: { include: { stack: true } } } });
}

// Choose a (scenario, clipA, clipB, humanChannel) tuple for the given mode using `rng`.
function chooseMatchup(scenarios: ScenarioWithClips[], mode: Mode, rng: () => number) {
  const usable = scenarios.filter((s) => {
    const human = s.clips.filter((c) => c.stack.isHuman);
    const ai = s.clips.filter((c) => !c.stack.isHuman);
    return mode === "golden-ears" ? human.length >= 1 && ai.length >= 1 : ai.length >= 2;
  });
  if (usable.length === 0) return null;

  const scenario = pickN(usable, 1, rng)[0];
  const ai = scenario.clips.filter((c) => !c.stack.isHuman);
  const human = scenario.clips.filter((c) => c.stack.isHuman);

  let clipA: DbClip & { stack: DbStack };
  let clipB: DbClip & { stack: DbStack };
  let humanChannel: Channel | null = null;

  if (mode === "golden-ears") {
    const h = pickN(human, 1, rng)[0];
    const a = pickN(ai, 1, rng)[0];
    if (rng() < 0.5) {
      clipA = h;
      clipB = a;
      humanChannel = "A";
    } else {
      clipA = a;
      clipB = h;
      humanChannel = "B";
    }
  } else {
    const [a, b] = pickN(ai, 2, rng);
    clipA = a;
    clipB = b;
  }

  return { scenario, clipA, clipB, humanChannel };
}

async function persistRound(
  matchup: NonNullable<ReturnType<typeof chooseMatchup>>,
  mode: Mode
): Promise<Round> {
  const { scenario, clipA, clipB, humanChannel } = matchup;
  const round = await prisma.round.create({
    data: {
      mode: toDbMode(mode),
      scenarioId: scenario.id,
      clipAId: clipA.id,
      clipBId: clipB.id,
      humanChannel: (humanChannel as DbChannel | null) ?? null,
    },
  });
  return {
    id: round.id,
    mode,
    scenario: { id: scenario.id, label: scenario.label, insight: scenario.insight },
    clipA: redactClip(clipA),
    clipB: redactClip(clipB),
  };
}

export async function getRound(mode: Mode): Promise<Round> {
  const scenarios = await loadScenariosWithClips();
  const matchup = chooseMatchup(scenarios, mode, Math.random);
  if (!matchup) throw new NoMatchupsError("No matchups right now. Check the leaderboard while we cook more.");
  return persistRound(matchup, mode);
}

export async function submitVote(
  sessionId: string,
  roundId: string,
  pick: Pick,
  played = true
): Promise<VoteResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      scenario: true,
      clipA: { include: { stack: true } },
      clipB: { include: { stack: true } },
    },
  });
  if (!round) throw new Error("That round expired. Loading a fresh one.");

  const mode = fromDbMode(round.mode);
  const isGolden = mode === "golden-ears";
  const correct = isGolden ? pick === round.humanChannel : undefined;
  // Only reward/update stats if the session actually played both clips (cheap anti-bot).
  // Ties are valid listener signal, but they do not move live Elo.
  const countsForStats = played;
  const countsForElo = played && !isGolden && (pick === "A" || pick === "B");

  const { session, economy, recorded } = await prisma.$transaction(async (tx) => {
    // Dedupe: one vote per (round, session). Re-votes are ignored for ranking + rewards.
    const existing = await tx.vote.findUnique({ where: { roundId_sessionId: { roundId, sessionId } } });
    if (existing) {
      const s = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
      return { session: s, economy: null, recorded: false };
    }

    await tx.vote.create({
      data: { roundId, sessionId, pick, correct, scenarioType: round.scenario.type, mode: round.mode },
    });

    const current = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
    let nextStreak = current.streak;
    if (isGolden) {
      nextStreak = correct ? current.streak + 1 : 0;
    }

    if (!countsForStats) {
      return { session: current, economy: null, recorded: false };
    }

    const data: Record<string, unknown> = { votes: { increment: 1 } };
    if (isGolden) {
      data.streak = nextStreak;
      data.longestStreak = Math.max(current.longestStreak, nextStreak);
      data.geVotes = { increment: 1 };
      if (correct) data.geCorrect = { increment: 1 };
    }
    await tx.session.update({ where: { id: sessionId }, data });

    // Live Elo only for decisive arena votes that actually played.
    if (countsForElo) {
      await applyElo(tx, {
        stackAId: round.clipA.stackId,
        stackBId: round.clipB.stackId,
        winner: pick,
        scenarioType: round.scenario.type,
      });
    }

    // --- Ear Engine: Glicko-2 rating + information-theoretic signal (golden-ears) ---
    const ctx = { mode, pick, correct, streakAfter: nextStreak } as const;
    const xpBefore = current.xp;
    const earBefore: glicko.Rating = { rating: current.earRating, rd: current.earRd, vol: current.earVol };
    let ear = earBefore;
    let signalXp: number | undefined;
    let expected: number | undefined; // E: prob the user spots the human

    if (isGolden) {
      // The AI stack is the non-human clip in the pair — it's the "opponent" the ear plays.
      const aiStackId = round.clipA.stack.isHuman ? round.clipB.stackId : round.clipA.stackId;
      const dec = (await tx.stackDeception.findUnique({ where: { stackId: aiStackId } })) ?? {
        rating: 1500,
        rd: 350,
        vol: 0.06,
      };
      const opp: glicko.Rating = { rating: dec.rating, rd: dec.rd, vol: dec.vol };
      expected = glicko.expectedScore(earBefore, opp);
      signalXp = signalBits(expected, !!correct);

      // Two-sided update: user wins (1) on a correct call, the stack wins (1) when it fools them.
      const score = correct ? 1 : 0;
      ear = glicko.update(earBefore, opp, score);
      const newDec = glicko.update(opp, earBefore, 1 - score);
      await tx.stackDeception.upsert({
        where: { stackId: aiStackId },
        create: { stackId: aiStackId, rating: newDec.rating, rd: newDec.rd, vol: newDec.vol, games: 1 },
        update: { rating: newDec.rating, rd: newDec.rd, vol: newDec.vol, games: { increment: 1 } },
      });
    }

    // --- economy: pity-timed bonus, coins/XP, quests, achievements ---
    const bonusRoll = rollBonus(current.bonusDry);
    const reward = rollVoteReward(ctx, { bonus: bonusRoll.bonus, xpOverride: signalXp });

    const quests = await applyQuestsForVote(tx, sessionId, ctx);
    const questCoins = quests.reduce((n, q) => n + (q.completed ? q.coins : 0), 0);
    const questXp = quests.reduce((n, q) => n + (q.completed ? q.xp : 0), 0);

    const snap: AchievementSnapshot = {
      votes: current.votes + 1,
      longestStreak: Math.max(current.longestStreak, nextStreak),
      level: levelForXp(xpBefore + reward.xp + questXp).level,
      loginStreak: current.loginStreak,
      firstPurchase: false, // evaluated in the purchase flow, not on vote
      dailyPerfect: false,
    };
    const achievements = await applyAchievements(tx, sessionId, snap);
    const achCoins = achievements.reduce((n, a) => n + a.coins, 0);
    const achXp = achievements.reduce((n, a) => n + a.xp, 0);

    // Tagged faucet ledger (decompose the vote reward into base / bonus / jackpot).
    const voteBase = reward.bonus ? (reward.coins - reward.jackpot) / 2 : reward.coins - reward.jackpot;
    const ledgerAll: { source: CoinSource; delta: number }[] = [
      { source: "vote", delta: Math.round(voteBase) },
      { source: "bonus", delta: reward.bonus ? Math.round(voteBase) : 0 },
      { source: "jackpot", delta: reward.jackpot },
      { source: "quest", delta: questCoins },
      { source: "achievement", delta: achCoins },
    ];
    const ledger = ledgerAll.filter((e) => e.delta > 0);
    if (ledger.length) {
      await tx.coinLedger.createMany({ data: ledger.map((e) => ({ sessionId, source: e.source, delta: e.delta })) });
    }

    const coinsDelta = reward.coins + questCoins + achCoins;
    const xpDelta = reward.xp + questXp + achXp;
    const after = await tx.session.update({
      where: { id: sessionId },
      data: {
        coins: { increment: coinsDelta },
        xp: { increment: xpDelta },
        bonusDry: bonusRoll.nextDry,
        earRating: ear.rating,
        earRd: ear.rd,
        earVol: ear.vol,
      },
    });

    const levelBefore = levelForXp(xpBefore).level;
    const levelAfter = levelForXp(after.xp).level;
    return {
      session: after,
      economy: {
        reward,
        quests,
        achievements,
        levelUp: levelAfter > levelBefore ? { level: levelAfter, rank: levelForXp(after.xp).rank } : undefined,
        coinsTotal: after.coins,
        xpTotal: after.xp,
        signalBits: signalXp,
        expected,
        bonusOdds: bonusRoll.odds,
        ear: { rating: Math.round(after.earRating), rd: Math.round(after.earRd), ci: glicko.confidence(after.earRd) },
      },
      recorded: true,
    };
  });

  const accuracy = session.geVotes > 0 ? Math.round((session.geCorrect / session.geVotes) * 100) : 0;

  return {
    recorded,
    winnerChannel: pick,
    correct,
    reveal: {
      A: toStackConfig(round.clipA.stack),
      B: toStackConfig(round.clipB.stack),
      insight: round.scenario.insight,
      outcomeA: outcomeFrom(round.clipA.transcript),
      outcomeB: outcomeFrom(round.clipB.transcript),
    },
    session: { accuracy, streak: session.streak, votes: session.votes },
    reward: economy ? { coins: economy.reward.coins, xp: economy.reward.xp, bonus: economy.reward.bonus, jackpot: economy.reward.jackpot } : undefined,
    rank: rankInfoFor(session.xp),
    levelUp: economy?.levelUp,
    questsProgressed: economy?.quests.filter((q) => q.changed).map(toQuestEvent),
    achievementsUnlocked: economy?.achievements.map((a) => ({ ...a, unlocked: true })),
    coinsTotal: economy?.coinsTotal ?? session.coins,
    xpTotal: economy?.xpTotal ?? session.xp,
    ear: economy?.ear ?? { rating: Math.round(session.earRating), rd: Math.round(session.earRd), ci: glicko.confidence(session.earRd) },
    signalBits: economy?.signalBits,
    bonusOdds: economy?.bonusOdds,
  };
}

// ---- economy helpers (run inside the vote/daily transactions) ----
interface QuestRunResult {
  id: string;
  label: string;
  progress: number;
  target: number;
  claimed: boolean;
  coins: number;
  xp: number;
  changed: boolean;
  completed: boolean; // completed on THIS action
}

function toQuestEvent(q: QuestRunResult): QuestProgressEvent {
  return { id: q.id, label: q.label, progress: q.progress, target: q.target, claimed: q.claimed, coins: q.coins, xp: q.xp, completed: q.completed };
}

// Advance today's quests for one vote; auto-claims on completion. Returns per-quest outcome.
async function applyQuestsForVote(
  tx: Tx,
  sessionId: string,
  ctx: { mode: Mode; pick: Pick; correct?: boolean; streakAfter: number }
): Promise<QuestRunResult[]> {
  const date = todayUtc();
  const defs = todaysQuests(date);
  const results: QuestRunResult[] = [];

  for (const def of defs) {
    const row =
      (await tx.questProgress.findUnique({ where: { sessionId_date_questId: { sessionId, date, questId: def.id } } })) ??
      (await tx.questProgress.create({ data: { sessionId, date, questId: def.id, progress: 0, target: def.target, claimed: false } }));

    if (row.claimed) {
      results.push({ ...questRow(def, row), changed: false, completed: false });
      continue;
    }

    const delta = questDelta(def, ctx);
    let nextProgress = row.progress;
    if (delta === "set") {
      nextProgress = Math.min(def.target, Math.max(row.progress, ctx.streakAfter));
    } else {
      nextProgress = Math.min(def.target, row.progress + delta);
    }
    const changed = nextProgress !== row.progress;
    const completed = nextProgress >= def.target;

    const updated = await tx.questProgress.update({
      where: { sessionId_date_questId: { sessionId, date, questId: def.id } },
      data: { progress: nextProgress, claimed: completed },
    });
    results.push({ ...questRow(def, updated), changed: changed || completed, completed: completed && !row.claimed });
  }
  return results;
}

function questRow(def: { id: string; label: string; coins: number; xp: number; target: number }, row: { progress: number; claimed: boolean }) {
  return { id: def.id, label: def.label, progress: row.progress, target: def.target, claimed: row.claimed, coins: def.coins, xp: def.xp };
}

// Unlock any newly-earned achievements; returns the new ones (with rewards).
async function applyAchievements(tx: Tx, sessionId: string, snapshot: AchievementSnapshot) {
  const owned = await tx.achievement.findMany({ where: { sessionId }, select: { achievementId: true } });
  const ownedSet = new Set(owned.map((a) => a.achievementId));
  const newly = evaluateAchievements(snapshot, ownedSet);
  for (const def of newly) {
    await tx.achievement.create({ data: { sessionId, achievementId: def.id } });
  }
  return newly;
}

// ---- daily challenge ----
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDaily(sessionId: string): Promise<{ rounds: Round[]; alreadyDone: boolean; resetsAt: string }> {
  const date = todayUtc();
  const existing = await prisma.dailyResult.findUnique({ where: { sessionId_date: { sessionId, date } } });

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const scenarios = await loadScenariosWithClips();
  const rng = seededRng(date); // identical content for everyone today
  const rounds: Round[] = [];
  for (let i = 0; i < 5; i += 1) {
    const matchup = chooseMatchup(scenarios, "golden-ears", rng);
    if (!matchup) break;
    rounds.push(await persistRound(matchup, "golden-ears"));
  }
  if (rounds.length === 0) throw new NoMatchupsError("Daily challenge is still cooking. Check back soon.");

  return { rounds, alreadyDone: Boolean(existing), resetsAt: tomorrow.toISOString() };
}

export async function submitDaily(sessionId: string, answers: DailyAnswer[]): Promise<DailyResultPayload> {
  const date = todayUtc();
  const existing = await prisma.dailyResult.findUnique({ where: { sessionId_date: { sessionId, date } } });
  if (existing) {
    return { score: existing.score, percentile: existing.percentile, shareId: existing.shareId };
  }

  // Recompute correctness server-side from the persisted rounds — never trust the client.
  const rounds = await prisma.round.findMany({ where: { id: { in: answers.map((a) => a.roundId) } } });
  const byId = new Map(rounds.map((r) => [r.id, r]));
  let score = 0;
  const graded = answers.map((a) => {
    const r = byId.get(a.roundId);
    const correct = r ? a.pick === r.humanChannel : false;
    if (correct) score += 1;
    return { ...a, correct };
  });

  // Percentile vs everyone who finished today.
  const others = await prisma.dailyResult.findMany({ where: { date }, select: { score: true } });
  const beaten = others.filter((o) => o.score < score).length;
  const percentile = others.length > 0 ? Math.round((beaten / others.length) * 100) : 50;

  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const shareId = `daily-${newShareId()}`;
  const accuracy = session.geVotes > 0 ? Math.round((session.geCorrect / session.geVotes) * 100) : 0;

  // Daily completion reward scales with score.
  const coinsEarned = 20 + score * 10;
  const baseXp = 15 + score * 8;

  const out = await prisma.$transaction(async (tx) => {
    await tx.dailyResult.create({ data: { sessionId, date, score, percentile, answers: graded, shareId } });
    await tx.shareCard.create({
      data: {
        id: shareId,
        handle: session.handle,
        mode: "daily",
        accuracy,
        score,
        percentile,
        streak: session.streak,
        tagline: `I scored ${score}/5 in today's golden-ears challenge.`,
      },
    });

    // Advance the "daily" quest if it's in today's set.
    let questCoins = 0;
    let questXp = 0;
    const def = todaysQuests(date).find((q) => q.kind === "daily");
    if (def) {
      const existingQ = await tx.questProgress.findUnique({
        where: { sessionId_date_questId: { sessionId, date, questId: def.id } },
      });
      if (!existingQ?.claimed) {
        await tx.questProgress.upsert({
          where: { sessionId_date_questId: { sessionId, date, questId: def.id } },
          create: { sessionId, date, questId: def.id, progress: def.target, target: def.target, claimed: true },
          update: { progress: def.target, claimed: true },
        });
        questCoins = def.coins;
        questXp = def.xp;
      }
    }

    // Perfect-daily achievement.
    const snap: AchievementSnapshot = {
      votes: session.votes,
      longestStreak: session.longestStreak,
      level: levelForXp(session.xp + baseXp + questXp).level,
      loginStreak: session.loginStreak,
      firstPurchase: false,
      dailyPerfect: score === 5,
    };
    const achievements = await applyAchievements(tx, sessionId, snap);
    const achCoins = achievements.reduce((n, a) => n + a.coins, 0);
    const achXp = achievements.reduce((n, a) => n + a.xp, 0);

    const xpBefore = session.xp;
    const totalDailyCoins = coinsEarned + questCoins + achCoins;
    await tx.coinLedger.create({ data: { sessionId, source: "daily", delta: totalDailyCoins } });
    const after = await tx.session.update({
      where: { id: sessionId },
      data: { coins: { increment: totalDailyCoins }, xp: { increment: baseXp + questXp + achXp } },
    });
    const levelUp =
      levelForXp(after.xp).level > levelForXp(xpBefore).level
        ? { level: levelForXp(after.xp).level, rank: levelForXp(after.xp).rank }
        : undefined;
    return { coinsEarned: coinsEarned + questCoins + achCoins, xpEarned: baseXp + questXp + achXp, levelUp, achievements };
  });

  return {
    score,
    percentile,
    shareId,
    coinsEarned: out.coinsEarned,
    xpEarned: out.xpEarned,
    levelUp: out.levelUp,
    achievementsUnlocked: out.achievements.map((a) => ({ ...a, unlocked: true })),
  };
}

// ---- leaderboard ----
export async function getLeaderboard(dim: Dimension): Promise<LeaderboardRow[]> {
  const stacks = await prisma.stack.findMany({
    where: { isHuman: false },
    include: { ratings: true },
  });

  const ratingFor = (s: (typeof stacks)[number], d: Dimension) =>
    s.ratings.find((r) => r.dimension === (d as DbDimension));

  const rows = stacks
    .map((s) => {
      const primary = ratingFor(s, dim);
      const nat = ratingFor(s, "naturalness");
      const inter = ratingFor(s, "interaction");
      return {
        stack: toStackConfig(s),
        rating: Math.round(primary?.rating ?? 1200),
        ratingCI: Math.round(primary?.ratingCI ?? 0),
        votes: primary?.votes ?? 0,
        trend: (Array.isArray(primary?.trend) ? (primary?.trend as number[]) : []) ?? [],
        naturalness: Math.round(nat?.rating ?? 1200),
        interaction: Math.round(inter?.rating ?? 1200),
      };
    })
    .sort((a, b) => b.rating - a.rating)
    .map((row, index) => ({ rank: index + 1, ...row }));

  // Cold start (no ratings yet): surface nothing so the UI shows its "voting just opened" state.
  const anyVotes = rows.some((r) => r.votes > 0);
  return anyVotes ? rows : [];
}

export async function getListeners(sessionId: string): Promise<Me[]> {
  const sessions = await prisma.session.findMany({
    where: { votes: { gt: 0 } },
    orderBy: [{ longestStreak: "desc" }, { votes: "desc" }],
    take: 25,
  });
  // Tag the current user's row with sessionId "me" so the UI pins + highlights it.
  return sessions.map((s) => (s.id === sessionId ? { ...toMe(s), sessionId: "me" } : toMe(s)));
}

function toMe(s: {
  id: string;
  handle: string;
  geVotes: number;
  geCorrect: number;
  votes: number;
  streak: number;
  longestStreak: number;
}): Me {
  return {
    sessionId: s.id,
    handle: s.handle,
    accuracy: s.geVotes > 0 ? Math.round((s.geCorrect / s.geVotes) * 100) : 0,
    streak: s.streak,
    votes: s.votes,
    dailyDone: false,
    longestStreak: s.longestStreak,
  };
}

export async function getMe(sessionId: string): Promise<Me> {
  const date = todayUtc();

  // Claim-on-read daily login bonus (once per UTC day).
  let s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  let loginReward: Me["loginReward"];
  const login = resolveLoginBonus(
    { lastLoginDate: s.lastLoginDate, loginStreak: s.loginStreak, longestLoginStreak: s.longestLoginStreak, freezesOwned: s.freezesOwned },
    date
  );
  if (login.claimed) {
    s = await prisma.session.update({
      where: { id: sessionId },
      data: {
        coins: { increment: login.coins },
        loginStreak: login.newStreak,
        longestLoginStreak: login.longestLoginStreak,
        lastLoginDate: date,
        freezesOwned: login.freezeUsed ? { decrement: 1 } : undefined,
      },
    });
    if (login.coins > 0) await prisma.coinLedger.create({ data: { sessionId, source: "login", delta: login.coins } });
    // A login can complete the 7-day-login achievement; apply its rewards too.
    const achievements = await applyAchievements(prisma, sessionId, {
      votes: s.votes,
      longestStreak: s.longestStreak,
      level: levelForXp(s.xp).level,
      loginStreak: s.loginStreak,
      firstPurchase: false,
      dailyPerfect: false,
    });
    const achCoins = achievements.reduce((n, a) => n + a.coins, 0);
    const achXp = achievements.reduce((n, a) => n + a.xp, 0);
    if (achCoins || achXp) {
      s = await prisma.session.update({
        where: { id: sessionId },
        data: { coins: { increment: achCoins }, xp: { increment: achXp } },
      });
    }
    loginReward = { coins: login.coins, newStreak: login.newStreak, schedule: loginBonusPreview(), freezeUsed: login.freezeUsed };
  }

  const daily = await prisma.dailyResult.findUnique({ where: { sessionId_date: { sessionId, date } } });
  const quests = await loadQuests(sessionId, date);
  const achievements = await loadAchievements(sessionId);

  return {
    ...toMe(s),
    sessionId: "me", // the UI pins the row whose sessionId === "me"
    dailyDone: Boolean(daily),
    dailyScore: daily?.score,
    coins: s.coins,
    rank: rankInfoFor(s.xp),
    loginStreak: s.loginStreak,
    longestLoginStreak: s.longestLoginStreak,
    freezesOwned: s.freezesOwned,
    hintsOwned: s.hintsOwned,
    theme: s.theme,
    ownedThemes: s.ownedThemes,
    quests,
    achievements,
    loginReward,
    ear: { rating: Math.round(s.earRating), rd: Math.round(s.earRd), ci: glicko.confidence(s.earRd) },
  };
}

async function loadQuests(sessionId: string, date: string): Promise<QuestView[]> {
  const defs = todaysQuests(date);
  const rows = await prisma.questProgress.findMany({ where: { sessionId, date } });
  const byId = new Map(rows.map((r) => [r.questId, r]));
  return defs.map((def) => {
    const row = byId.get(def.id);
    return { id: def.id, label: def.label, progress: row?.progress ?? 0, target: def.target, claimed: row?.claimed ?? false, coins: def.coins, xp: def.xp };
  });
}

async function loadAchievements(sessionId: string): Promise<AchievementView[]> {
  const owned = await prisma.achievement.findMany({ where: { sessionId } });
  const ownedMap = new Map(owned.map((a) => [a.achievementId, a.unlockedAt]));
  return achievementDefs().map((def) => ({
    id: def.id,
    label: def.label,
    desc: def.desc,
    coins: def.coins,
    xp: def.xp,
    unlocked: ownedMap.has(def.id),
    unlockedAt: ownedMap.get(def.id)?.toISOString(),
  }));
}

// ---- shop ----
export async function getShop(sessionId: string): Promise<Shop> {
  const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const owned = new Set(s.ownedThemes);
  const items: ShopItemView[] = SHOP_ITEMS.map((item) => {
    const isTheme = item.kind === "theme";
    const themeKey = isTheme ? themeKeyOf(item) : undefined;
    return {
      id: item.id,
      name: item.name,
      desc: item.desc,
      price: item.price,
      kind: item.kind,
      owned: isTheme ? owned.has(themeKey!) : false,
      equipped: isTheme ? s.theme === themeKey : undefined,
    };
  });
  return { coins: s.coins, items, freezesOwned: s.freezesOwned, hintsOwned: s.hintsOwned };
}

export async function purchaseItem(sessionId: string, itemId: string): Promise<ShopPurchaseResult> {
  const item = shopItem(itemId);
  if (!item) throw new Error("No such item.");

  const result = await prisma.$transaction(async (tx) => {
    const s = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
    if (s.coins < item.price) throw new Error("Not enough coins.");

    const data: Record<string, unknown> = { coins: { decrement: item.price } };
    if (item.kind === "theme") {
      const key = themeKeyOf(item);
      if (s.ownedThemes.includes(key)) throw new Error("Already owned.");
      data.ownedThemes = { set: [...s.ownedThemes, key] };
    } else if (item.kind === "freeze") {
      data.freezesOwned = { increment: 1 };
    } else if (item.kind === "hint") {
      data.hintsOwned = { increment: 1 };
    }
    await tx.session.update({ where: { id: sessionId }, data });
    await tx.coinLedger.create({ data: { sessionId, source: "purchase", delta: -item.price } });

    // first_purchase achievement
    const achievements = await applyAchievements(tx, sessionId, {
      votes: s.votes,
      longestStreak: s.longestStreak,
      level: levelForXp(s.xp).level,
      loginStreak: s.loginStreak,
      firstPurchase: true,
      dailyPerfect: false,
    });
    const achCoins = achievements.reduce((n, a) => n + a.coins, 0);
    const achXp = achievements.reduce((n, a) => n + a.xp, 0);
    if (achCoins || achXp) {
      await tx.session.update({ where: { id: sessionId }, data: { coins: { increment: achCoins }, xp: { increment: achXp } } });
    }
    return achievements;
  });

  const shop = await getShop(sessionId);
  return { ...shop, achievementsUnlocked: result.map((a) => ({ ...a, unlocked: true })) };
}

export async function equipTheme(sessionId: string, themeKey: string): Promise<{ theme: string; ownedThemes: string[] }> {
  if (!ALL_THEME_KEYS.includes(themeKey)) throw new Error("Unknown theme.");
  const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  if (!s.ownedThemes.includes(themeKey)) throw new Error("Theme not owned.");
  const updated = await prisma.session.update({ where: { id: sessionId }, data: { theme: themeKey } });
  return { theme: updated.theme, ownedThemes: updated.ownedThemes };
}

export async function spendHint(sessionId: string, roundId: string): Promise<{ tell: string; hintsOwned: number }> {
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { scenario: true } });
  if (!round) throw new Error("That round expired.");
  if (round.mode !== "golden_ears") throw new Error("Hints are only available in Golden ears rounds.");

  const hintsOwned = await prisma.$transaction(async (tx) => {
    const s = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
    if (s.hintsOwned < 1) throw new Error("No hint credits. Buy one in the shop.");
    const updated = await tx.session.update({ where: { id: sessionId }, data: { hintsOwned: { decrement: 1 } } });
    return updated.hintsOwned;
  });
  return { tell: round.scenario.insight, hintsOwned };
}

// ---- /system live engine telemetry ----
export async function getSystemStats(): Promise<import("../types").SystemStats> {
  const grouped = await prisma.coinLedger.groupBy({ by: ["source"], _sum: { delta: true } });
  const totalBy = new Map(grouped.map((g) => [g.source, g._sum.delta ?? 0]));

  const sources = COIN_SOURCES.map((s) => ({ source: s, total: Math.max(0, totalBy.get(s) ?? 0) }));
  const sinks = COIN_SINKS.map((s) => ({ source: s, total: Math.abs(Math.min(0, totalBy.get(s) ?? 0)) }));
  const minted = sources.reduce((n, s) => n + s.total, 0);
  const burned = sinks.reduce((n, s) => n + s.total, 0);

  const circ = await prisma.session.aggregate({ _sum: { coins: true } });
  const circulating = circ._sum.coins ?? 0;

  // Ear-rating distribution across rated players (those who've played golden-ears).
  const rated = await prisma.session.findMany({ where: { geVotes: { gt: 0 } }, select: { earRating: true, earRd: true } });
  const edges = [1300, 1400, 1500, 1600, 1700];
  const labels = ["<1300", "1300–1400", "1400–1500", "1500–1600", "1600–1700", "1700+"];
  const counts = new Array(labels.length).fill(0) as number[];
  for (const r of rated) {
    let idx = edges.findIndex((e) => r.earRating < e);
    if (idx === -1) idx = labels.length - 1;
    counts[idx] += 1;
  }
  const avgRd = rated.length ? Math.round(rated.reduce((n, r) => n + r.earRd, 0) / rated.length) : 350;

  return {
    economy: { sources, sinks, minted, burned, circulating },
    ear: {
      buckets: labels.map((label, i) => ({ label, count: counts[i] })),
      avgRd,
      players: rated.length,
    },
    config: {
      ranks: ranksTable(),
      pity: { base: PITY.base, step: PITY.step, hard: PITY.hard },
      pityCurve: Array.from({ length: PITY.hard + 1 }, (_, d) => Number(bonusOdds(d).toFixed(3))),
      earn: {
        arenaCoins: EARN.arenaCoins,
        geCorrectCoins: EARN.geCorrectCoins,
        signalBitsBase: EARN.signalBitsBase,
        jackpotCoins: EARN.jackpotCoins,
      },
    },
  };
}

export async function getShareCard(id: string): Promise<ShareCardData> {
  const card = await prisma.shareCard.findUnique({ where: { id } });
  if (!card) {
    // Graceful fallback so a stale/unknown share link still renders an OG image.
    return {
      stats: { id, handle: "Listener", accuracy: 0, streak: 0, mode: "matchup" },
      tagline: "Test your ear against real humans on Earwitness.",
    };
  }
  return {
    stats: {
      id: card.id,
      handle: card.handle,
      accuracy: card.accuracy,
      score: card.score ?? undefined,
      percentile: card.percentile ?? undefined,
      streak: card.streak,
      mode: card.mode as ShareCardData["stats"]["mode"],
    },
    tagline: card.tagline,
  };
}
