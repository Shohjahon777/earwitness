// Client-facing data layer. Component code imports ONLY from here — never fetch directly.
//
// Two backends behind one set of signatures:
//   • Real:  fetches the /api/* route handlers (Postgres + ranking + Blob audio).
//   • Mock:  the in-memory fixtures in ./mock-api, used when a ?mock= flag is present or
//            NEXT_PUBLIC_USE_MOCKS=1 is set, so every loading/error/empty/offline/done state
//            stays reachable in development without a database.
import type {
  DailyAnswer,
  DailyResultPayload,
  Dimension,
  LeaderboardRow,
  Me,
  Mode,
  Pick,
  Round,
  ShareCardData,
  Shop,
  ShopPurchaseResult,
  SystemStats,
  VoteResult,
} from "./types";
import { readMockFlag } from "./mock-flags";
import * as mock from "./mock-api";

export type { DailyResultPayload, ShopPurchaseResult } from "./types";

function useMock(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "1") return true;
  return typeof window !== "undefined" && readMockFlag() !== null;
}

async function http<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export async function getRound(mode: Mode): Promise<Round> {
  if (useMock()) return mock.getRound(mode);
  return http<Round>(`/api/round?mode=${encodeURIComponent(mode)}`);
}

export async function submitVote(roundId: string, pick: Pick): Promise<VoteResult> {
  if (useMock()) return mock.submitVote(roundId, pick);
  // The UI only votes after both clips played → tell the server it's a genuine, countable vote.
  return http<VoteResult>("/api/vote", {
    method: "POST",
    body: JSON.stringify({ roundId, pick, played: true }),
  });
}

export async function getDaily(): Promise<{ rounds: Round[]; alreadyDone: boolean; resetsAt: string }> {
  if (useMock()) return mock.getDaily();
  return http("/api/daily");
}

export async function submitDaily(answers: DailyAnswer[]): Promise<DailyResultPayload> {
  if (useMock()) return mock.submitDaily(answers);
  return http("/api/daily", { method: "POST", body: JSON.stringify({ answers }) });
}

export async function getLeaderboard(dim: Dimension): Promise<LeaderboardRow[]> {
  if (useMock()) return mock.getLeaderboard(dim);
  return http<LeaderboardRow[]>(`/api/leaderboard?dim=${encodeURIComponent(dim)}`);
}

export async function getListeners(): Promise<Me[]> {
  if (useMock()) return mock.getListeners();
  return http<Me[]>("/api/listeners");
}

export async function getMe(): Promise<Me> {
  if (useMock()) return mock.getMe();
  return http<Me>("/api/me");
}

export async function getShareCard(id: string): Promise<ShareCardData> {
  if (useMock()) return mock.getShareCard(id);
  return http<ShareCardData>(`/api/share/${encodeURIComponent(id)}`);
}

// ---- shop / economy ----
export async function getShop(): Promise<Shop> {
  if (useMock()) return mock.getShop();
  return http<Shop>("/api/shop");
}

export async function purchaseItem(itemId: string): Promise<ShopPurchaseResult> {
  if (useMock()) return mock.purchaseItem(itemId);
  return http<ShopPurchaseResult>("/api/shop/purchase", { method: "POST", body: JSON.stringify({ itemId }) });
}

export async function equipTheme(theme: string): Promise<{ theme: string; ownedThemes: string[] }> {
  if (useMock()) return mock.equipTheme(theme);
  return http("/api/shop/equip", { method: "POST", body: JSON.stringify({ theme }) });
}

export async function spendHint(roundId: string): Promise<{ tell: string; hintsOwned: number }> {
  if (useMock()) return mock.spendHint(roundId);
  return http("/api/hint", { method: "POST", body: JSON.stringify({ roundId }) });
}

export async function getSystemStats(): Promise<SystemStats> {
  if (useMock()) return mock.getSystemStats();
  return http<SystemStats>("/api/system");
}
