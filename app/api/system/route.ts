import { NextResponse } from "next/server";
import { getSystemStats } from "@/lib/server/data";
import { handleError } from "@/lib/server/http";

// Live telemetry for the /system engineering page (economy faucet/sink, ear distribution, config).
export async function GET() {
  try {
    return NextResponse.json(await getSystemStats());
  } catch (err) {
    return handleError(err);
  }
}
