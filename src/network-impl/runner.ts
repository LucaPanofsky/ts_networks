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
  // A propagator must never sit in the worklist twice at once. Otherwise a
  // producer-then-consumer ranking enqueues the consumer once by rank and again
  // when the producer fires, so it runs twice over the *same* inputs. Re-running is
  // only safe when it recomputes an equal value — true for primitives (=== by
  // value) but NOT for a fresh array/object each call, which then self-contradicts
  // on merge (Something.equals is reference equality). Coalescing simultaneous
  // schedules keeps re-firing correct: a fire always reads the latest cell values,
  // and a genuine later change re-enqueues after the pending fire has drained.
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
