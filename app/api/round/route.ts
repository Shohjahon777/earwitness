import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateSession } from "@/lib/server/session";
import { getRound } from "@/lib/server/data";
import { fail, handleError } from "@/lib/server/http";

const Query = z.enum(["arena", "golden-ears"]);

export async function GET(request: Request) {
  try {
    await getOrCreateSession(); // ensure a session cookie exists for subsequent votes
    const parsed = Query.safeParse(new URL(request.url).searchParams.get("mode"));
    if (!parsed.success) return fail("Unknown mode.", 422);
    return NextResponse.json(await getRound(parsed.data));
  } catch (err) {
    return handleError(err);
  }
}
