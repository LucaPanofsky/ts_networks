// The back end: a parsed/merged program → one self-contained JS module (as a string),
// ready to write to a .js file and run via import()/eval. One fragment per construct;
// everything construct-specific lives in the modules' emit(). The module assembled here
// imports only the runtime (core/runtime-api.ts) and builds a single registry.

import type { Program, AstNode } from "./program.js";
import type { RecordNode } from "../constructs/defrecord/ast.js";
import type { FnNode } from "../constructs/defn/ast.js";
import type { EnumNode } from "../constructs/defenum/ast.js";
import type { NetworkNode } from "../constructs/defnetwork/ast.js";
import type { EmitCtx } from "../core/module.js";
import { ConstructKind } from "../core/enums.js";
import type { RecordDescriptor, LlmTypeEnv } from "../core/types.js";
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
  // Base: no program context. `emitProgram` overrides these with real lookups so heavy
  // constructs can inline a record they produce / the type env a `defllmfn` needs.
  record: () => undefined,
  typeEnv: () => ({ records: [], enums: [], predicates: [] }),
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

  // Records by name, so a heavy construct (grammar/ttable) can inline the descriptor of a
  // record it produces (the reused engine compiler needs the field shape; the constructor
  // stays late-bound via `ref`).
  const recordsByName = new Map<string, RecordDescriptor>();
  for (const node of nodes) if (node.kind === ConstructKind.Record) recordsByName.set(node.name, node);

  // The whole-program type environment a `defllmfn` inlines: every record + enum, and the
  // PREDICATE fns (the schema resolves a field typed by a predicate to its base type). The
  // pipeline nodes are structurally the engine ASTs, so this is a filter, not a conversion.
  const isRecord = (n: AstNode): n is RecordNode => n.kind === ConstructKind.Record;
  const isEnum = (n: AstNode): n is EnumNode => n.kind === ConstructKind.Enum;
  const isPredicate = (n: AstNode): n is FnNode => n.kind === ConstructKind.Fn && n.isPredicate;
  const typeEnv: LlmTypeEnv = {
    records: nodes.filter(isRecord).map((n) => ({ name: n.name, fields: n.fields })),
    enums: nodes.filter(isEnum).map((n) => ({ name: n.name, values: n.values })),
    predicates: nodes.filter(isPredicate).map((n) => ({ name: n.name, params: n.params, returnType: n.returnType, body: n.body })),
  };
  const ectx: EmitCtx = { ...ctx, record: (name) => recordsByName.get(name), typeEnv: () => typeEnv };

  const fragments = nodes.map((node) => MODULES[node.kind].emit(node, ectx));

  // A self-describing manifest: each network's input cells (in order) and output cell, so a
  // loader can run the artifact by name without the source. Emitted as a single-line `export
  // const` (the in-process loader keeps it as a local; see runtime/load.ts).
  const isNetwork = (n: AstNode): n is NetworkNode => n.kind === ConstructKind.Network;
  const manifest = {
    networks: Object.fromEntries(
      nodes.filter(isNetwork).map((n) => [n.name, { from: n.signature.from, to: n.signature.to }]),
    ),
  };
  const manifestFragment = `export const __manifest = ${JSON.stringify(manifest)};`;

  const parts = [HEADER, ...(builtins ? [builtins] : []), ...fragments, manifestFragment, FOOTER];
  return parts.join("\n\n") + "\n";
}
