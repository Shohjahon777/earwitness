import { NextResponse } from "next/server";
import { getOrCreateSession } from "@/lib/server/session";
import { getShop } from "@/lib/server/data";
import { handleError } from "@/lib/server/http";

export async function GET() {
  try {
    const session = await getOrCreateSession();
    return NextResponse.json(await getShop(session.id));
  } catch (err) {
    return handleError(err);
  }
}
