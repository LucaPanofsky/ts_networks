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
import type { Registry } from "../core/runtime-api.js";

// What an emitted artifact's `__manifest` carries: each network's input cells (in order)
// and its output cell. Lets a caller seed inputs BY NAME without the original source.
export type Manifest = { networks: Record<string, { from: string[]; to: string }> };

export type LoadedProgram = { registry: Registry; manifest: Manifest };

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
