import type { Cell } from "./cell.js";
import type { Propagator } from "./propagator.js";

export function run(
  cells: Map<string, Cell>,
  propagators: Map<string, Propagator>,
  candidates: string[],
): Map<string, Cell> {
  const queue = [...candidates];
  while (queue.length > 0) {
    const name = queue.shift()!;
    const propagator = propagators.get(name)!;
    const msg = propagator.call(cells);
    if (msg.type === "next") {
      for (const p of msg.propagators) {
        queue.push((p as Propagator).name);
      }
    }
  }
  return cells;
}
