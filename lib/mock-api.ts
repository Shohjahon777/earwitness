import type {
  Channel,
  DailyAnswer,
  Dimension,
  LeaderboardRow,
  Me,
  Mode,
  Pick,
  Round,
  ShareCardData,
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
  } else if (pick !== "tie") {
    session.streak += 1;
  }

  return {
    recorded: mockFlag() !== "offline",
    winnerChannel: pick,
    correct,
    reveal: {
      A: round.clipA.stack,
      B: round.clipB.stack,
      insight: round.scenario.insight
    },
    session: { ...session }
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
): Promise<{ score: number; percentile: number; shareId: string }> {
  await latency();
  maybeFail("Daily submission");
  dailySubmitted = true;
  const score = answers.filter((answer) => answer.correct).length;
  return {
    score,
    percentile: Math.min(96, 42 + score * 11),
    shareId: "daily-7f2"
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
    dailyScore: 4
  };
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
