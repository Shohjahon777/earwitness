import "server-only";
import type { Prisma, PrismaClient, ScenarioType, Dimension } from "@prisma/client";
import { prisma } from "./db";

type Tx = Prisma.TransactionClient | PrismaClient;

const K = 24; // Elo step
const TREND_CAP = 16;
const ALL_DIMENSIONS: Dimension[] = ["overall", "naturalness", "interaction"];

// Which leaderboard dimensions a vote in this scenario feeds.
// Interaction handling is driven ONLY by interruption/pause scenarios — this is the proof
// that we rank stacks (turn handling), not just voices. Naturalness comes from clean scenarios.
export function dimensionsFor(type: ScenarioType): Dimension[] {
  switch (type) {
    case "interrupt":
    case "pause":
      return ["overall", "interaction"];
    case "clean":
      return ["overall", "naturalness"];
    case "accent":
    default:
      return ["overall"];
  }
}

function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function pushTrend(trend: unknown, rating: number): number[] {
  const arr = Array.isArray(trend) ? (trend as number[]) : [];
  return [...arr, Math.round(rating)].slice(-TREND_CAP);
}

async function getRating(tx: Tx, stackId: string, dimension: Dimension) {
  const row = await tx.stackRating.findUnique({ where: { stackId_dimension: { stackId, dimension } } });
  return row ?? { stackId, dimension, rating: 1200, ratingCI: 0, votes: 0, trend: [] as number[] };
}

// Live Elo: called per non-tie arena vote, inside the vote transaction. This drives the number
// the voter sees tick. The Bradley–Terry cron later overwrites with confidence-aware ratings.
export async function applyElo(
  tx: Tx,
  args: { stackAId: string; stackBId: string; winner: "A" | "B"; scenarioType: ScenarioType }
) {
  const { stackAId, stackBId, winner, scenarioType } = args;
  for (const dimension of dimensionsFor(scenarioType)) {
    const a = await getRating(tx, stackAId, dimension);
    const b = await getRating(tx, stackBId, dimension);
    const expA = expectedScore(a.rating, b.rating);
    const scoreA = winner === "A" ? 1 : 0;
    const nextA = a.rating + K * (scoreA - expA);
    const nextB = b.rating + K * (1 - scoreA - (1 - expA));

    await tx.stackRating.upsert({
      where: { stackId_dimension: { stackId: stackAId, dimension } },
      create: { stackId: stackAId, dimension, rating: nextA, votes: 1, trend: pushTrend([], nextA) },
      update: { rating: nextA, votes: { increment: 1 }, trend: pushTrend(a.trend, nextA) },
    });
    await tx.stackRating.upsert({
      where: { stackId_dimension: { stackId: stackBId, dimension } },
      create: { stackId: stackBId, dimension, rating: nextB, votes: 1, trend: pushTrend([], nextB) },
      update: { rating: nextB, votes: { increment: 1 }, trend: pushTrend(b.trend, nextB) },
    });
  }
}

// Bradley–Terry fit per dimension over ALL arena votes. Produces ratings with confidence
// intervals so a stack with few votes can't outrank a well-tested one.
export async function computeBradleyTerry() {
  for (const dimension of ALL_DIMENSIONS) {
    await fitDimension(dimension);
  }
}

const BT_LAST_RUN = "bt:lastRun";

// Cron-free refresh: recompute the published Bradley–Terry ratings at most once per
// `minIntervalMs`, regardless of how often it's called. Designed to be invoked from `after()`
// in the vote/leaderboard routes so the leaderboard stays fresh on normal traffic alone —
// no Vercel Cron required (works on Hobby). Returns true if it actually recomputed.
export async function maybeRefreshRanking(minIntervalMs = 5 * 60 * 1000): Promise<boolean> {
  const meta = await prisma.meta.findUnique({ where: { key: BT_LAST_RUN } });
  const last = meta ? Number(meta.value) : 0;
  if (Date.now() - last < minIntervalMs) return false;

  // Claim the slot first so concurrent invocations don't all recompute (best-effort).
  await prisma.meta.upsert({
    where: { key: BT_LAST_RUN },
    create: { key: BT_LAST_RUN, value: String(Date.now()) },
    update: { value: String(Date.now()) },
  });

  await computeBradleyTerry();
  return true;
}

async function fitDimension(dimension: Dimension) {
  // Pull decisive arena votes for the scenario types that feed this dimension.
  const types: ScenarioType[] =
    dimension === "interaction"
      ? ["interrupt", "pause"]
      : dimension === "naturalness"
        ? ["clean"]
        : ["interrupt", "pause", "clean", "accent"];

  const votes = await prisma.vote.findMany({
    where: { mode: "arena", scenarioType: { in: types }, pick: { in: ["A", "B"] } },
    include: { round: true },
  });

  // Build pairwise win counts.
  const ids = new Set<string>();
  const wins = new Map<string, Map<string, number>>(); // wins[i][j] = times i beat j
  const games = new Map<string, Map<string, number>>();
  const totalVotes = new Map<string, number>();

  const bump = (m: Map<string, Map<string, number>>, i: string, j: string) => {
    if (!m.has(i)) m.set(i, new Map());
    const row = m.get(i)!;
    row.set(j, (row.get(j) ?? 0) + 1);
  };

  // We need stack ids, not clip ids — resolve through the rounds' clips.
  const clipIds = [...new Set(votes.flatMap((v) => [v.round.clipAId, v.round.clipBId]))];
  const clips = await prisma.clip.findMany({ where: { id: { in: clipIds } }, select: { id: true, stackId: true } });
  const stackOf = new Map(clips.map((c) => [c.id, c.stackId]));

  for (const v of votes) {
    const stackA = stackOf.get(v.round.clipAId);
    const stackB = stackOf.get(v.round.clipBId);
    if (!stackA || !stackB || stackA === stackB) continue;
    ids.add(stackA);
    ids.add(stackB);
    const winner = v.pick === "A" ? stackA : stackB;
    const loser = v.pick === "A" ? stackB : stackA;
    bump(wins, winner, loser);
    bump(games, stackA, stackB);
    bump(games, stackB, stackA);
    totalVotes.set(stackA, (totalVotes.get(stackA) ?? 0) + 1);
    totalVotes.set(stackB, (totalVotes.get(stackB) ?? 0) + 1);
  }

  const stackIds = [...ids];
  if (stackIds.length === 0) return;

  const winTotal = new Map<string, number>();
  for (const i of stackIds) {
    let w = 0;
    for (const j of stackIds) w += wins.get(i)?.get(j) ?? 0;
    winTotal.set(i, w);
  }

  // MM iteration for the BT strengths p_i. Add a tiny prior win/loss vs a virtual average
  // opponent so unbeaten/winless stacks stay finite.
  const p = new Map<string, number>(stackIds.map((id) => [id, 1]));
  const PRIOR = 1; // virtual games for regularization
  for (let iter = 0; iter < 200; iter += 1) {
    const next = new Map<string, number>();
    for (const i of stackIds) {
      let denom = PRIOR / (p.get(i)! + 1); // virtual opponent at strength 1
      for (const j of stackIds) {
        if (i === j) continue;
        const nij = (games.get(i)?.get(j) ?? 0);
        if (nij === 0) continue;
        denom += nij / (p.get(i)! + p.get(j)!);
      }
      const numer = (winTotal.get(i) ?? 0) + PRIOR * 0.5; // half a virtual win
      next.set(i, numer / denom);
    }
    // normalize to geometric mean 1
    const logs = stackIds.map((id) => Math.log(next.get(id)!));
    const meanLog = logs.reduce((s, x) => s + x, 0) / logs.length;
    for (const id of stackIds) next.set(id, next.get(id)! / Math.exp(meanLog));
    p.clear();
    for (const [id, val] of next) p.set(id, val);
  }

  // Map BT strengths to Elo-like ratings centered at 1200.
  const ratingOf = new Map<string, number>();
  for (const id of stackIds) ratingOf.set(id, 1200 + (400 / Math.LN10) * Math.log(p.get(id)!));

  // Confidence interval from Fisher information: SE = 1 / sqrt(sum_j n_ij * P_ij * (1 - P_ij)),
  // converted to rating units (×400/ln10) and ×1.96 for a ~95% interval.
  for (const id of stackIds) {
    let info = 0;
    for (const j of stackIds) {
      if (id === j) continue;
      const nij = games.get(id)?.get(j) ?? 0;
      if (nij === 0) continue;
      const pij = expectedScore(ratingOf.get(id)!, ratingOf.get(j)!);
      info += nij * pij * (1 - pij);
    }
    const se = info > 0 ? 1 / Math.sqrt(info) : 1;
    const ci = Math.round((400 / Math.LN10) * se * 1.96);
    const existing = await prisma.stackRating.findUnique({ where: { stackId_dimension: { stackId: id, dimension } } });
    const rating = ratingOf.get(id)!;
    await prisma.stackRating.upsert({
      where: { stackId_dimension: { stackId: id, dimension } },
      create: { stackId: id, dimension, rating, ratingCI: ci, votes: totalVotes.get(id) ?? 0, trend: pushTrend([], rating) },
      update: { rating, ratingCI: ci, votes: totalVotes.get(id) ?? 0, trend: pushTrend(existing?.trend, rating) },
    });
  }
}
