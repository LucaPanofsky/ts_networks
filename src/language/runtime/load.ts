// ── Loading a compiled artifact in-process ──────────────────────────────────────────
//
// An emitted program is a self-contained `.js` module that opens with
// `import * as rt from "@tsn/runtime"` and ends with `export default __reg;` (plus an
// `export const __manifest` describing its networks). That bare `@tsn/runtime` specifier
// is not resolvable as a real package here (the project is run-from-source, not published),
// so to RUN an artifact in-process we do what the test harness has always done: strip the
// module-level `import`/`export` syntax and inject the runtime as the `rt` argument of a
// `new Function`. This is the entire "@tsn/runtime resolution" story for now — true
// standalone `node program.js` (a real package / loader / import-map) is a later step.
//
// This promotes that one-off test helper into a real, reusable loader so the `run-compiled`
// operation can execute artifacts the same way the tests do.

import * as rt from "./index.js";
import type { AdaptedRegistry } from "./index.js";

// What an emitted artifact's `__manifest` carries: each network's input cells (in order)
// and its output cell, plus `values` — the JS-identifier-legal names of the program's value
// bindings (fns + record constructors). The networks let a caller seed inputs BY NAME; the
// values let it evaluate cell expressions that reference the program's own functions (e.g.
// `cell=myFn(3)`), mirroring the engine `run`'s sandbox.
export type Manifest = {
  networks: Record<string, { from: string[]; to: string }>;
  values?: string[];
};

// The loaded program exposes the ADAPTED registry (not just the frozen core surface): the
// `run-compiled` operation reaches `backing.get("network/<name>").impl` to call a network's
// all-cells accessor (a `resolve()` thunk would drop the function's attached `cells`), and
// sets `toolResolver` to inject the full program-reasoning tools.
export type LoadedProgram = { registry: AdaptedRegistry; manifest: Manifest };

// Evaluate an emitted `.js` module string in-process, returning its registry and manifest.
// The emitted code references `rt.*`; we bind `rt` to the runtime implementation.
export function loadProgram(code: string): LoadedProgram {
  const body =
    code
      .split("\n")
      .filter((l) => !/^\s*import\s/.test(l)) // module imports are illegal in a Function body
      .filter((l) => !/^\s*export\s+default\b/.test(l)) // `export default __reg;` — __reg is already bound
      .map((l) => l.replace(/^(\s*)export\s+(const\s)/, "$1$2")) // keep `export const __manifest` as a local
      .join("\n") +
    '\nreturn { registry: __reg, manifest: (typeof __manifest !== "undefined" ? __manifest : { networks: {} }) };';
  return new Function("rt", body)(rt) as LoadedProgram;
}
