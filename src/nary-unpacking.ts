import { I, type InfoStructure } from "./info-structure.js";

export function naryUnpackingDissertation(f: (...args: unknown[]) => unknown) {
  function loop(remaining: InfoStructure<unknown>[], acc: (...rest: unknown[]) => InfoStructure<unknown>): InfoStructure<unknown> {
    if (remaining.length === 0) return acc();
    return remaining[0]!.bind((arg) =>
      loop(remaining.slice(1), (...rest) => acc(arg, ...rest))
    );
  }
  return (...structs: InfoStructure<unknown>[]) =>
    loop(structs, (...unwrapped) => I(f(...unwrapped)));
}

export function naryUnpacking(fn: (...args: unknown[]) => unknown, arity: number): (...structs: InfoStructure<unknown>[]) => InfoStructure<unknown> {
  switch (arity) {
    case 1: return (s0) => s0.bind(a0 => I(fn(a0)));
    case 2: return (s0, s1) => s0.bind(a0 => s1.bind(a1 => I(fn(a0, a1))));
    case 3: return (s0, s1, s2) => s0.bind(a0 => s1.bind(a1 => s2.bind(a2 => I(fn(a0, a1, a2)))));
    case 4: return (s0, s1, s2, s3) => s0.bind(a0 => s1.bind(a1 => s2.bind(a2 => s3.bind(a3 => I(fn(a0, a1, a2, a3))))));
    case 5: return (s0, s1, s2, s3, s4) => s0.bind(a0 => s1.bind(a1 => s2.bind(a2 => s3.bind(a3 => s4.bind(a4 => I(fn(a0, a1, a2, a3, a4)))))));
    default: throw new Error(`naryUnpacking: arity ${arity} is not supported (max 5)`);
  }
}
