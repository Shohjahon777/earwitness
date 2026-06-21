"use client";

import { create } from "zustand";
import type { AchievementView, DailyResultPayload, EarInfo, Me, QuestView, RankInfo, Shop, VoteResult } from "./types";

interface SessionState {
  // core stats (existing)
  handle: string;
  accuracy: number;
  streak: number;
  votes: number;
  // economy
  coins: number;
  ear: EarInfo | null;
  rank: RankInfo | null;
  loginStreak: number;
  freezesOwned: number;
  hintsOwned: number;
  theme: string;
  ownedThemes: string[];
  quests: QuestView[];
  achievements: AchievementView[];
  loaded: boolean;

  setSession: (session: { accuracy: number; streak: number; votes: number }) => void;
  setProfile: (me: Me) => void;
  applyVoteResult: (result: VoteResult) => void;
  applyDailyResult: (result: DailyResultPayload) => void;
  setCoins: (coins: number) => void;
  setShopSnapshot: (shop: Pick<Shop, "coins" | "freezesOwned" | "hintsOwned">) => void;
  setHintsOwned: (hintsOwned: number) => void;
  unlockAchievements: (achievements?: AchievementView[]) => void;
  setTheme: (theme: string, ownedThemes?: string[]) => void;
}

function mergeAchievements(current: AchievementView[], unlocked?: AchievementView[]) {
  if (!unlocked?.length) return current;
  const byId = new Map(current.map((achievement) => [achievement.id, achievement]));
  for (const achievement of unlocked) {
    byId.set(achievement.id, { ...byId.get(achievement.id), ...achievement, unlocked: true });
  }
  return Array.from(byId.values());
}

export const useSessionStore = create<SessionState>((set) => ({
  handle: "",
  accuracy: 0,
  streak: 0,
  votes: 0,
  coins: 0,
  ear: null,
  rank: null,
  loginStreak: 0,
  freezesOwned: 0,
  hintsOwned: 0,
  theme: "booth",
  ownedThemes: ["booth"],
  quests: [],
  achievements: [],
  loaded: false,

  setSession: (session) => set(session),

  setProfile: (me) =>
    set({
      handle: me.handle,
      accuracy: me.accuracy,
      streak: me.streak,
      votes: me.votes,
      coins: me.coins ?? 0,
      ear: me.ear ?? null,
      rank: me.rank ?? null,
      loginStreak: me.loginStreak ?? 0,
      freezesOwned: me.freezesOwned ?? 0,
      hintsOwned: me.hintsOwned ?? 0,
      theme: me.theme ?? "booth",
      ownedThemes: me.ownedThemes ?? ["booth"],
      quests: me.quests ?? [],
      achievements: me.achievements ?? [],
      loaded: true,
    }),

  applyVoteResult: (result) =>
    set((state) => ({
      accuracy: result.session.accuracy,
      streak: result.session.streak,
      votes: result.session.votes,
      coins: result.coinsTotal ?? state.coins,
      ear: result.ear ?? state.ear,
      rank: result.rank ?? state.rank,
      achievements: mergeAchievements(state.achievements, result.achievementsUnlocked),
      // reflect quest progress immediately
      quests: result.questsProgressed
        ? state.quests.map((q) => {
            const upd = result.questsProgressed!.find((p) => p.id === q.id);
            return upd ? { ...q, progress: upd.progress, claimed: upd.claimed } : q;
          })
        : state.quests,
    })),

  applyDailyResult: (result) =>
    set((state) => ({
      coins: result.coinsEarned ? state.coins + result.coinsEarned : state.coins,
      rank: result.levelUp && state.rank ? { ...state.rank, level: result.levelUp.level, rank: result.levelUp.rank } : state.rank,
      achievements: mergeAchievements(state.achievements, result.achievementsUnlocked),
      quests: state.quests.map((q) => (q.id.includes("daily") ? { ...q, progress: q.target, claimed: true } : q)),
    })),

  setCoins: (coins) => set({ coins }),
  setShopSnapshot: (shop) =>
    set({
      coins: shop.coins,
      freezesOwned: shop.freezesOwned,
      hintsOwned: shop.hintsOwned,
    }),
  setHintsOwned: (hintsOwned) => set({ hintsOwned }),
  unlockAchievements: (achievements) => set((state) => ({ achievements: mergeAchievements(state.achievements, achievements) })),
  setTheme: (theme, ownedThemes) => set((state) => ({ theme, ownedThemes: ownedThemes ?? state.ownedThemes })),
}));
