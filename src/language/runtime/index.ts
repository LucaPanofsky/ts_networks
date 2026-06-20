// The @tsn/runtime implementation — slice 1.
//
// Decision: ADAPT the existing engine. This is a thin translation layer between the new
// pipeline's boundary (core/runtime-api.ts: `register(key, entry)` + late-bound
// `resolve(key) -> Impl`) and the existing registry (src/registry.ts: `register(entry)`
// with `entry.fnName`, `get(fnName) -> entry`). No algebra is reimplemented.
//
// Only `registry()` is provided here — that is all the pure (record/fn) path needs.
// The construct runtimes (`grammar`/`extract`/`network`/`llmFn`) arrive when those
// constructs do, each wrapping its existing engine counterpart.

import { createRegistry } from "../../registry.js";
import type { Registry, RegistryEntry, Impl } from "../core/runtime-api.js";

export function registry(): Registry {
  const backing = createRegistry();
  return {
    register(key: string, entry: RegistryEntry): void {
      backing.register({
        fnName: key,
        impl: entry.impl as (...args: unknown[]) => unknown,
        arity: entry.arity,
        morphism: entry.morphism,
      });
    },
    // Late-bound: returns a thunk that looks the key up at CALL time, so a reference
    // emitted before its target is registered (forward/cyclic) still resolves.
    resolve(key: string): Impl {
      return (...args: unknown[]) => {
        const found = backing.get(key);
        if (!found) throw new Error(`@tsn/runtime: unresolved registry key "${key}"`);
        return found.impl(...args);
      };
    },
  };
}
