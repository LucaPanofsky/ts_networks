import { bind, value, type InfoStructure } from "./info-structure.js";

export function naryUnpackingDissertation(f: (...args: unknown[]) => unknown) {
  function loop(remaining: InfoStructure<unknown>[], acc: (...rest: unknown[]) => InfoStructure<unknown>): InfoStructure<unknown> {
    if (remaining.length === 0) return acc();
    return bind(remaining[0]!, (arg) =>
      loop(remaining.slice(1), (...rest) => acc(arg, ...rest))
    );
  }
  return (...structs: InfoStructure<unknown>[]) =>
    loop(structs, (...unwrapped) => value(f(...unwrapped)));
}

export function naryUnpacking(fn: (...args: unknown[]) => unknown, arity: number): (...structs: InfoStructure<unknown>[]) => InfoStructure<unknown> {
  if (arity > 5) throw new Error(`naryUnpacking: arity ${arity} is not supported (max 5)`);
  return (...structs) => {
    const acc = new Array(arity);
    function chain(i: number): InfoStructure<unknown> {
      if (i === arity) return value(fn(...acc));
      return bind(structs[i]!, (arg) => { acc[i] = arg; return chain(i + 1); });
    }
    return chain(0);
  };
}
