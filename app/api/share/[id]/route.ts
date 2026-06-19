import { NextResponse } from "next/server";
import { getShareCard } from "@/lib/server/data";
import { handleError } from "@/lib/server/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getShareCard(id));
  } catch (err) {
    return handleError(err);
  }
}
