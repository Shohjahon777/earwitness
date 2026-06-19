export type MockFlag = "loading" | "error" | "empty" | "offline" | "done" | null;

export function readMockFlag(searchParams?: URLSearchParams | string | null): MockFlag {
  if (typeof window === "undefined" && !searchParams) return null;

  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : searchParams ?? new URLSearchParams(window.location.search);

  const raw = params.get("mock");
  if (
    raw === "loading" ||
    raw === "error" ||
    raw === "empty" ||
    raw === "offline" ||
    raw === "done"
  ) {
    return raw;
  }

  return null;
}
