import type { InfoStructure } from "../info-structure.js";
import type { Cell } from "./cell.js";
import type { AsyncPropagator } from "./async-propagator.js";
import type { RunResult } from "./runner.js";

export async function asyncRun(
  cells: Map<string, Cell>,
  propagators: Map<string, AsyncPropagator>,
  candidates: string[],
  onRecurse?: (mappedInputs: Record<string, InfoStructure<unknown>>) => string[],
): Promise<RunResult> {
  const queue = [...candidates];
  while (queue.length > 0) {
    const name = queue.shift()!;
    const propagator = propagators.get(name)!;
    const msg = await propagator.call(cells);
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
        queue.push((p as AsyncPropagator).name);
      }
    }
  }
  return { type: "done", cells };
}
