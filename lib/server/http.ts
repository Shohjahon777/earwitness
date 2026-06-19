import "server-only";
import { NextResponse } from "next/server";
import { isNoMatchups } from "./data";

// Uniform JSON error envelope. The client api (lib/api.ts) throws using `error` as the message,
// which the UI surfaces in its empty/error states.
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(err: unknown) {
  if (isNoMatchups(err)) {
    return fail(err instanceof Error ? err.message : "No matchups right now.", 404);
  }
  const message = err instanceof Error ? err.message : "Something went wrong.";
  console.error("[api]", err);
  return fail(message, 500);
}
