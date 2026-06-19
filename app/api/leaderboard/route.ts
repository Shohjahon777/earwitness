import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getLeaderboard } from "@/lib/server/data";
import { maybeRefreshRanking } from "@/lib/server/ranking";
import { fail, handleError } from "@/lib/server/http";

const Query = z.enum(["overall", "naturalness", "interaction"]);

export async function GET(request: Request) {
  try {
    const parsed = Query.safeParse(new URL(request.url).searchParams.get("dim") ?? "overall");
    if (!parsed.success) return fail("Unknown dimension.", 422);
    const rows = await getLeaderboard(parsed.data);
    // Self-healing ranking: refresh Bradley–Terry in the background (throttled, no cron needed).
    after(() => maybeRefreshRanking().catch((e) => console.error("[rank refresh]", e)));
    return NextResponse.json(rows);
  } catch (err) {
    return handleError(err);
  }
}
