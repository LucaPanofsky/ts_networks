// The native intrinsics block emitted into every module's preamble.
//
// `BUILTIN_DEFS` (REUSED, one source of truth — exported from the existing compiler) maps
// a DSL name → a JS function-literal *string* for the host-only primitives the language
// cannot express itself: `str`/`every`/`some`, the `str/*` family, and the `math/*` family.
// `compileExpr` lowers a call to one of these to a BARE mangled identifier (`math$sqrt(…)`),
// so each must exist as a module-scope `const` — they cannot route through the `rt.` import.
//
// Shadowing: a user (or prelude) definition of the same name WINS — its `const` is emitted
// by the construct fragment, so we skip the intrinsic to avoid a duplicate declaration.
// This mirrors the old compiler's `!declared.has(mangle(name))` filter.

import { BUILTIN_DEFS } from "../../sandbox/jsgen/compiler.js";

// `declared` holds the MANGLED names every construct (+ prelude) will bind; `mangle` is the
// emitter's canonical name→identifier map (passed in to stay the single definition of it).
export function emitBuiltins(declared: ReadonlySet<string>, mangle: (name: string) => string): string {
  return Object.entries(BUILTIN_DEFS)
    .filter(([name]) => !declared.has(mangle(name)))
    .map(([name, fn]) => `const ${mangle(name)} = ${fn};`)
    .join("\n");
}
