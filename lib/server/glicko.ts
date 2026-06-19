import "server-only";
/**
 * Glicko-2 (Glickman 2013) — a Bayesian skill-rating system with uncertainty and volatility.
 *
 * We use it for the Earwitness "Ear Engine": a two-sided game per golden-ears round between the
 * user's EAR rating and the AI stack's DECEPTION rating. Catching the human = the user wins and
 * the stack loses; both sides update. This is the per-listener counterpart to the Bradley–Terry
 * model we run on stacks (lib/server/ranking.ts) — same statistical spirit (ratings + confidence),
 * applied to people instead of systems.
 *
 * Public ratings live on the familiar ~1500 scale; internally Glicko-2 works on the μ/φ scale
 * (rating−1500)/173.7178 and RD/173.7178.
 */

export interface Rating {
  rating: number; // public scale (≈1500)
  rd: number; // rating deviation (uncertainty), public scale
  vol: number; // volatility σ
}

export const DEFAULT_RATING: Rating = { rating: 1500, rd: 350, vol: 0.06 };

const SCALE = 173.7178;
const TAU = 0.5; // system constant: constrains volatility change
const EPSILON = 1e-6;

const toMu = (r: number) => (r - 1500) / SCALE;
const toPhi = (rd: number) => rd / SCALE;
const fromMu = (mu: number) => mu * SCALE + 1500;
const fromPhi = (phi: number) => phi * SCALE;

// g(φ): how much an opponent's uncertainty discounts the result.
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// E: expected score of `player` against `opponent` — also the probability the player "wins".
function expected(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/** Probability `player` beats `opponent` (used both for matchmaking expectation and info-XP). */
export function expectedScore(player: Rating, opponent: Rating): number {
  return expected(toMu(player.rating), toMu(opponent.rating), toPhi(opponent.rd));
}

/** ±confidence interval in public rating points (~95%). */
export function confidence(rd: number): number {
  return Math.round(1.96 * rd);
}

/**
 * Single-game Glicko-2 update for `player` against one `opponent`.
 * score: 1 = player won, 0 = lost, 0.5 = draw.
 */
export function update(player: Rating, opponent: Rating, score: number): Rating {
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.vol;

  const muJ = toMu(opponent.rating);
  const phiJ = toPhi(opponent.rd);

  const gJ = g(phiJ);
  const E = expected(mu, muJ, phiJ);

  // Estimated variance of the rating based on game outcomes.
  const v = 1 / (gJ * gJ * E * (1 - E));
  // Estimated improvement in rating.
  const delta = v * gJ * (score - E);

  // --- iterate the new volatility σ' (Illinois algorithm) ---
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k += 1;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  // --- new RD and rating ---
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gJ * (score - E);

  return {
    rating: fromMu(newMu),
    rd: clampRd(fromPhi(newPhi)),
    vol: newSigma,
  };
}

// Keep RD in a sane band: never overconfident, never unbounded.
function clampRd(rd: number): number {
  return Math.min(350, Math.max(30, rd));
}
