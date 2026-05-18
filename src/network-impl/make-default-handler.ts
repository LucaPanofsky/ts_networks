import { bind, value, type InfoStructure } from "../info-structure.js";

type Handler = (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>;

export function makeDefaultHandler(fn: (...args: unknown[]) => unknown, arity: number): Handler {
  if (arity > 5) throw new Error(`makeDefaultHandler: arity ${arity} is not supported (max 5)`);
  return (...structs) => {
    const acc = new Array(arity);
    function chain(i: number): InfoStructure<unknown> {
      if (i === arity) return value(fn(...acc));
      return bind(structs[i]!, (arg) => { acc[i] = arg; return chain(i + 1); });
    }
    return chain(0);
  };
}
