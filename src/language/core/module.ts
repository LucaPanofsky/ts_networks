// The contract every construct module satisfies. A module is a small, self-contained
// unit with two halves:
//
//   parse  (front end)  block text  → typed AST node
//   emit   (back end)   AST node    → a JS source fragment
//
// `emit` is code generation: the whole program lowers to a single `.js` module that
// imports the runtime (see core/runtime-api.ts) and is run by `eval`/`import()`. Every
// construct emits source uniformly — the pure ones (record, fn) emit plain JS; the
// heavy ones (grammar, extract, network, llmfn) emit a thin call into the runtime with
// their spec inlined as data. Cross-references resolve in the emitted module's scope.
//
// The contract speaks only AstNodeBase, never the concrete union — that is what keeps
// `core/` from depending on `constructs/`. The pipeline narrows to the real union.

import type { Block, AstNodeBase, RecordDescriptor, LlmTypeEnv } from "./types.js";
import type { ConstructKind } from "./enums.js";

// What a module is given while emitting. Construct-agnostic: the runtime import alias to
// prefix calls with, and the two naming helpers that make fragments compose into one
// module.
export interface EmitCtx {
  // The runtime namespace alias, e.g. "rt" → emit `${ctx.rt}.network(...)`.
  readonly rt: string;
  // DSL name → a safe, STABLE JS identifier. The same mangle runs at definition and at
  // every reference, so emitted bindings and call sites line up.
  mangle(name: string): string;
  // A JS expression that references another construct's binding BY NAME. Routed through
  // the registry (late-bound) so emitted fragments are order-independent and cyclic
  // references (mutual recursion) resolve at run time, not emit time.
  ref(name: string): string;
  // The descriptor of a record DEFINED in this program, by name (or undefined). The heavy
  // constructs (grammar, ttable) inline the record they produce into their emitted spec so
  // the reused engine compiler can build it; the constructor itself stays late-bound via
  // `ref`. Populated by the emitter from the program's record nodes; pure modules ignore it.
  record(name: string): RecordDescriptor | undefined;
  // The whole program's type environment (records + enums + predicate fns), inlined by a
  // `defllmfn` so the reused engine `deriveProtocol` can build the model's structured-output
  // schema. The same for every llmfn in the program; only the llmfn module reads it.
  typeEnv(): LlmTypeEnv;
}

export interface ConstructModule<N extends AstNodeBase = AstNodeBase> {
  readonly kind: ConstructKind;
  readonly keyword: string; // the splitter dispatches on this
  parse(block: Block): N;
  emit(node: N, ctx: EmitCtx): string;
}
