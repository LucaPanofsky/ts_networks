// The memoization cache key for an async leaf (llmfn / network): a stable JSON string of the
// argument list, with object keys sorted so two structurally-equal records key identically (a
// re-fire over equal inputs shares the one in-flight APromise — re-merging can't self-contradict).
// Shared by the modular runtime; moved out of the retired jsgen registry.
export function canonicalKey(args: unknown[]): string {
  return JSON.stringify(args, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}
