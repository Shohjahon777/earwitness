import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateSession } from "@/lib/server/session";
import { purchaseItem } from "@/lib/server/data";
import { fail, handleError } from "@/lib/server/http";

const Body = z.object({ itemId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const session = await getOrCreateSession();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Invalid purchase.", 422);
    return NextResponse.json(await purchaseItem(session.id, parsed.data.itemId));
  } catch (err) {
    return handleError(err);
  }
}
