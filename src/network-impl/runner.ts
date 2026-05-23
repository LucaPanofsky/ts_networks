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
  const queue = [...candidates];
  while (queue.length > 0) {
    const name = queue.shift()!;
    const propagator = propagators.get(name)!;
    const msg = propagator.call(cells);
    if (msg.type === "exit") return { type: "exit", reason: msg.reason, cells };
    if (msg.type === "recurse") {
      if (onRecurse) {
        const freshQueue = onRecurse(msg.mappedInputs);
        queue.splice(0, queue.length, ...freshQueue);
      }
      continue;
    }
    if (msg.type === "next") {
      for (const p of msg.propagators) {
        queue.push((p as Propagator).name);
      }
    }
  }
  return { type: "done", cells };
}
