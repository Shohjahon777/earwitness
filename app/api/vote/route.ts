import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getOrCreateSession } from "@/lib/server/session";
import { submitVote } from "@/lib/server/data";
import { maybeRefreshRanking } from "@/lib/server/ranking";
import { fail, handleError } from "@/lib/server/http";

const Body = z.object({
  roundId: z.string().min(1),
  pick: z.enum(["A", "B", "tie"]),
  played: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getOrCreateSession();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Invalid vote.", 422);
    const { roundId, pick, played } = parsed.data;
    const result = await submitVote(session.id, roundId, pick, played ?? true);
    // Keep the published Bradley–Terry ratings fresh without a cron (throttled refresh).
    after(() => maybeRefreshRanking().catch((e) => console.error("[rank refresh]", e)));
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
