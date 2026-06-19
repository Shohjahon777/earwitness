import "server-only";
import { customAlphabet } from "nanoid";
import { prisma } from "./db";
import { applyElo, dimensionsFor } from "./ranking";
import type {
  Channel,
  Clip,
  DailyAnswer,
  Dimension,
  LeaderboardRow,
  Me,
  Mode,
  Pick,
  Round,
  ShareCardData,
  StackConfig,
  VoteResult,
} from "../types";
import type {
  Mode as DbMode,
  Channel as DbChannel,
  Stack as DbStack,
  Clip as DbClip,
  Dimension as DbDimension,
} from "@prisma/client";

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

function redactClip(clip: DbClip): Clip {
  return { id: clip.id, url: clip.blobUrl, durationSec: clip.durationSec, stack: HIDDEN_STACK };
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
  // Only count toward ranking/stats if the session actually played both clips (cheap anti-bot).
  const counts = played && pick !== "tie";

  const session = await prisma.$transaction(async (tx) => {
    // Dedupe: one vote per (round, session). Re-votes are ignored for ranking.
    const existing = await tx.vote.findUnique({ where: { roundId_sessionId: { roundId, sessionId } } });
    if (!existing) {
      await tx.vote.create({
        data: {
          roundId,
          sessionId,
          pick,
          correct,
          scenarioType: round.scenario.type,
          mode: round.mode,
        },
      });

      const data: Record<string, unknown> = { votes: { increment: 1 } };
      if (isGolden) {
        data.geVotes = { increment: 1 };
        if (correct) data.geCorrect = { increment: 1 };
      }
      const current = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
      let nextStreak = current.streak;
      if (isGolden) {
        nextStreak = correct ? current.streak + 1 : 0;
      } else if (pick !== "tie") {
        nextStreak = current.streak + 1;
      }
      data.streak = nextStreak;
      data.longestStreak = Math.max(current.longestStreak, nextStreak);
      await tx.session.update({ where: { id: sessionId }, data });

      // Live Elo only for decisive arena votes that actually played.
      if (counts && !isGolden && (pick === "A" || pick === "B")) {
        await applyElo(tx, {
          stackAId: round.clipA.stackId,
          stackBId: round.clipB.stackId,
          winner: pick,
          scenarioType: round.scenario.type,
        });
      }
    }
    return tx.session.findUniqueOrThrow({ where: { id: sessionId } });
  });

  const accuracy = session.geVotes > 0 ? Math.round((session.geCorrect / session.geVotes) * 100) : 0;

  return {
    recorded: counts,
    winnerChannel: pick,
    correct,
    reveal: {
      A: toStackConfig(round.clipA.stack),
      B: toStackConfig(round.clipB.stack),
      insight: round.scenario.insight,
    },
    session: { accuracy, streak: session.streak, votes: session.votes },
  };
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

export async function submitDaily(
  sessionId: string,
  answers: DailyAnswer[]
): Promise<{ score: number; percentile: number; shareId: string }> {
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

  await prisma.$transaction([
    prisma.dailyResult.create({
      data: { sessionId, date, score, percentile, answers: graded, shareId },
    }),
    prisma.shareCard.create({
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
    }),
  ]);

  return { score, percentile, shareId };
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
  const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const date = todayUtc();
  const daily = await prisma.dailyResult.findUnique({ where: { sessionId_date: { sessionId, date } } });
  return {
    ...toMe(s),
    sessionId: "me", // the UI pins the row whose sessionId === "me"
    dailyDone: Boolean(daily),
    dailyScore: daily?.score,
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
