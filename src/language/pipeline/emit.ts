// The back end: a parsed/merged program → one self-contained JS module (as a string),
// ready to write to a .js file and run via import()/eval. One fragment per construct;
// everything construct-specific lives in the modules' emit(). The module assembled here
// imports only the runtime (core/runtime-api.ts) and builds a single registry.

import type { Program } from "./program.js";
import type { EmitCtx } from "../core/module.js";
import { MODULES } from "./registry.js";

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

const PRELUDE = `import * as ${RT} from "@tsn/runtime";\nconst __reg = ${RT}.registry();`;
const FOOTER = `export default __reg;`;

export function emitProgram(program: Program, ctx: EmitCtx = defaultCtx): string {
  const fragments = program.nodes.map((node) => MODULES[node.kind].emit(node, ctx));
  return [PRELUDE, ...fragments, FOOTER].join("\n\n") + "\n";
}
