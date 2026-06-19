import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateSession } from "@/lib/server/session";
import { getDaily, submitDaily } from "@/lib/server/data";
import { fail, handleError } from "@/lib/server/http";

export async function GET() {
  try {
    const session = await getOrCreateSession();
    return NextResponse.json(await getDaily(session.id));
  } catch (err) {
    return handleError(err);
  }
}

const Body = z.object({
  answers: z.array(
    z.object({
      roundId: z.string().min(1),
      pick: z.enum(["A", "B", "tie"]),
      correct: z.boolean().optional(),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const session = await getOrCreateSession();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Invalid daily submission.", 422);
    return NextResponse.json(await submitDaily(session.id, parsed.data.answers));
  } catch (err) {
    return handleError(err);
  }
}
