import { bind, value, type InfoStructure } from "./info-structure.js";

export function naryUnpacking(f: (...args: unknown[]) => unknown) {
  function loop(remaining: InfoStructure<unknown>[], acc: (...rest: unknown[]) => InfoStructure<unknown>): InfoStructure<unknown> {
    if (remaining.length === 0) return acc();
    return bind(remaining[0]!, (arg) =>
      loop(remaining.slice(1), (...rest) => acc(arg, ...rest))
    );
  }
  return (...structs: InfoStructure<unknown>[]) =>
    loop(structs, (...unwrapped) => value(f(...unwrapped)));
}
