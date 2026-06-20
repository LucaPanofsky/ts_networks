// The back end: a parsed/merged program → one self-contained JS module (as a string),
// ready to write to a .js file and run via import()/eval. One fragment per construct;
// everything construct-specific lives in the modules' emit(). The module assembled here
// imports only the runtime (core/runtime-api.ts) and builds a single registry.

import type { Program } from "./program.js";
import type { EmitCtx } from "../core/module.js";
import { MODULES } from "./registry.js";
import { withPrelude } from "./prelude.js";
import { emitBuiltins } from "./builtins.js";

// The runtime import alias every emitted file uses.
const RT = "rt";

// The default emit context. `mangle` mirrors the existing compiler (DSL names may carry
// ?, !, / — none legal in a JS identifier). `ref` routes cross-construct references
// through the registry, so fragments are order-independent and cyclic references
// (mutual recursion) resolve at run time.
export const defaultCtx: EmitCtx = {
  rt: RT,
  mangle: (name) => name.replace(/\?/g, "$").replace(/!/g, "_").replace(/\//g, "$"),
  ref: (name) => `__reg.resolve(${JSON.stringify(name)})`,
};

// The frozen preamble: import the runtime, open a registry, and bind the host helpers an
// `interpolate` body lowers to (`__interp`). The native-intrinsics block and the prelude
// are added per-program below (they depend on what the program shadows).
const HEADER = `import * as ${RT} from "@tsn/runtime";\nconst __reg = ${RT}.registry();\nconst __interp = ${RT}.interp;`;
const FOOTER = `export default __reg;`;

export function emitProgram(program: Program, ctx: EmitCtx = defaultCtx): string {
  // The prelude (standard library) is supplied here, at emit time, so `parseProgram` keeps
  // reporting exactly the user's AST. A user definition of a prelude name shadows it.
  const nodes = withPrelude(program.nodes);
  // Everything the program binds (user + prelude), mangled — used to skip any native
  // intrinsic the program shadows (else a duplicate `const` declaration).
  const declared = new Set(nodes.map((node) => ctx.mangle(node.name)));
  const builtins = emitBuiltins(declared, ctx.mangle);

  const fragments = nodes.map((node) => MODULES[node.kind].emit(node, ctx));
  const parts = [HEADER, ...(builtins ? [builtins] : []), ...fragments, FOOTER];
  return parts.join("\n\n") + "\n";
}
