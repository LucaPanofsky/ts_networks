// ── Loading a compiled artifact ──────────────────────────────────────────────────────
//
// An emitted program is a self-contained `.js` module that opens with
// `import * as rt from "@tsn/runtime"` and ends with `export default __reg;` (plus an
// `export const __manifest` describing its networks). There are two ways to load and run it,
// both producing the same `LoadedProgram` so the shared `runNetworkOnLoaded` core is agnostic:
//
//   • IN-PROCESS — `loadProgram(code)`: strip the module-level `import`/`export` syntax and
//     inject the LIVE runtime as the `rt` argument of a `new Function`. Needs no build and no
//     real `@tsn/runtime` resolution (the bare specifier is never resolved), so it is the
//     daily-use path. Crucially it binds the artifact to THIS module's runtime instance, so
//     `instanceof` checks (projection, merge) line up.
//
//   • PLAIN NODE — `loadArtifactFromPath(absPath)`: a real `import()` of a built artifact, so
//     its `import * as rt from "@tsn/runtime"` resolves to the BUILT runtime (`dist/`). This is
//     the "compile once, run anywhere" tail — once a later step, now built. The caller MUST run
//     in that same `dist/` world (plain `node` on the built tree, not `tsx`), or the two runtime
//     copies make every Info value fail its `instanceof` and project to null.

import { pathToFileURL } from "node:url";
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

// Load a BUILT artifact by path via a real ESM `import()` — the plain-`node` path. The artifact's
// own `import * as rt from "@tsn/runtime"` resolves through node_modules to the built runtime, so
// this must run in that same world (`npm run build` first; invoke with plain `node` on the built
// tree, never `tsx`). The module's default export is the registry; `__manifest` is a named export.
export async function loadArtifactFromPath(absPath: string): Promise<LoadedProgram> {
  let mod: { default?: unknown; __manifest?: Manifest };
  try {
    mod = (await import(pathToFileURL(absPath).href)) as typeof mod;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // The one resolution that fails predictably: `@tsn/runtime` not on disk (build not run).
    if (/@tsn\/runtime/.test(msg) && /(Cannot find|ERR_MODULE_NOT_FOUND|resolve)/i.test(msg)) {
      throw new Error(
        `cannot resolve "@tsn/runtime" while loading ${absPath} — run \`npm run build\` first ` +
          `so the runtime is built under dist/ (original: ${msg})`,
      );
    }
    throw e;
  }
  if (mod.default == null) {
    throw new Error(`${absPath} is not a ts-networks artifact (no default registry export)`);
  }
  return {
    registry: mod.default as AdaptedRegistry,
    manifest: mod.__manifest ?? { networks: {} },
  };
}
