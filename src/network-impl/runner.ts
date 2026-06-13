import type { InfoStructure } from "../info-structure.js";
import type { Cell } from "./cell.js";
import type { Propagator } from "./propagator.js";

export type RunResult =
  | { type: "done"; cells: Map<string, Cell> }
  | { type: "exit"; reason: unknown; cells: Map<string, Cell> };

export function run(
  cells: Map<string, Cell>,
  propagators: Map<string, Propagator>,
  candidates: string[],
  onRecurse?: (mappedInputs: Record<string, InfoStructure<unknown>>) => string[],
): RunResult {
  // Coalesce duplicate schedules: a propagator never sits in the worklist twice at
  // once. The producer-then-consumer ranking enqueues a consumer once by rank and again
  // when its producer fires, so it would otherwise run twice over the *same* inputs.
  // That re-run is now a harmless no-op — merge is idempotent under structural value
  // equality, so a re-derived equal record merges to no change and `after.equals(before)`
  // stops propagation. So this coalescing is a performance optimization, not a
  // correctness requirement: a genuine later change re-enqueues after the pending fire
  // drains.
  //
  // (Historical note: before structural `valueEquals`, a fresh equal object merged to a
  // Contradiction, so this dedup was load-bearing for correctness. It no longer is — see
  // report/equality.md. The one case where double-firing still costs — an impure `llmfn`
  // leaf making a duplicate API call — is unrelated to equality and tracked separately;
  // note the async runner does no such coalescing.)
  const queue = [...candidates];
  const queued = new Set(queue);
  const enqueue = (name: string) => {
    if (!queued.has(name)) {
      queue.push(name);
      queued.add(name);
    }
  };
  while (queue.length > 0) {
    const name = queue.shift()!;
    queued.delete(name);
    const propagator = propagators.get(name)!;
    const msg = propagator.call(cells);
    if (msg.type === "exit") return { type: "exit", reason: msg.reason, cells };
    if (msg.type === "recurse") {
      if (onRecurse) {
        const freshQueue = onRecurse(msg.mappedInputs);
        queue.splice(0, queue.length, ...freshQueue);
        queued.clear();
        for (const n of queue) queued.add(n);
      }
      continue;
    }
    if (msg.type === "next") {
      for (const p of msg.propagators) {
        enqueue((p as Propagator).name);
      }
    }
  }
  return { type: "done", cells };
}
