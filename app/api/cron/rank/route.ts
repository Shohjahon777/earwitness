import { NextResponse } from "next/server";
import { computeBradleyTerry } from "@/lib/server/ranking";
import { handleError } from "@/lib/server/http";

// Manual / external trigger to recompute the published Bradley–Terry ratings + CIs.
// NOT required in normal operation — the leaderboard self-heals via maybeRefreshRanking()
// from the vote/leaderboard routes (no cron needed, works on Vercel Hobby). Keep this for an
// on-demand rebuild or an optional external scheduler (GitHub Actions, cron-job.org, QStash).
// Protected by CRON_SECRET: call with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await computeBradleyTerry();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (err) {
    return handleError(err);
  }
}
