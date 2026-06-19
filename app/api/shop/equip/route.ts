import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateSession } from "@/lib/server/session";
import { equipTheme } from "@/lib/server/data";
import { fail, handleError } from "@/lib/server/http";

const Body = z.object({ theme: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const session = await getOrCreateSession();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Invalid theme.", 422);
    const result = await equipTheme(session.id, parsed.data.theme);
    // Persist the selected theme in a cookie so SSR can apply it without a flash.
    const res = NextResponse.json(result);
    res.cookies.set("ew_theme", result.theme, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    return handleError(err);
  }
}
