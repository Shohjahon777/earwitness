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

export interface Clip {
  id: string;
  url: string;
  durationSec: number;
  stack: StackConfig;
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
  reveal: { A: StackConfig; B: StackConfig; insight: string };
  session: { accuracy: number; streak: number; votes: number };
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
