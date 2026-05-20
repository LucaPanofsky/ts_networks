import type { DataNetwork } from "./data-network.js";
import { Hierarchy } from "./hierarchy.js";

function buildHierarchy(network: DataNetwork): Hierarchy<string> {
  const h = new Hierarchy<string>();

  // cell name → propagator name that writes to it
  const writers = new Map<string, string>();
  for (const [name, p] of network.propagators) {
    writers.set(p.to, name);
  }

  // propagator derives from the propagator that writes to each of its inputs
  for (const [name, p] of network.propagators) {
    for (const inputCell of p.from) {
      const writer = writers.get(inputCell);
      if (writer) {
        try {
          h.derive(name, writer);
        } catch {
          // cyclic dependency — skip this derivation
        }
      }
    }
  }

  return h;
}

function makeComparator(h: Hierarchy<string>, keys: string[]): (a: string, b: string) => number {
  const ancCount = new Map(keys.map(k => [k, h.ancestors(k).size]));
  const descCount = new Map(keys.map(k => [k, h.descendants(k).size]));

  return (a: string, b: string): number => {
    if (h.isDerived(a, b)) return 1;   // a depends on b → b first
    if (h.isDerived(b, a)) return -1;  // b depends on a → a first
    const aa = ancCount.get(a) ?? 0;
    const ab = ancCount.get(b) ?? 0;
    if (aa > ab) return -1;
    if (aa < ab) return 1;
    const da = descCount.get(a) ?? 0;
    const db = descCount.get(b) ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
    return a.localeCompare(b);
  };
}

export function rankPropagators(network: DataNetwork): string[] {
  const h = buildHierarchy(network);
  const keys = Array.from(network.propagators.keys());
  return [...keys].sort(makeComparator(h, keys));
}
