// The construct-aware half of the @tsn/runtime surface — the COMPILERS for the heavy
// constructs. It lives HERE (not in `core/`) because it names the construct AST node types,
// and `core/` may not import `constructs/` (the acyclic `core ← constructs ← pipeline` rule).
// The construct-agnostic half (value protocol, registry, interp) stays in `core/runtime-api.ts`.
//
// SINGLE SOURCE OF TRUTH: these functions take the construct NODE types DIRECTLY — there is no
// parallel "Spec" shape to keep in sync. The emitted artifact inlines a node as a JS data
// literal, and the runtime reads it as that node. The runtime impl (`./index.ts`) is
// type-checked against this interface (`const _check: ConstructRuntime = { … }`), so a drift
// between an adapter and its node type is a compile error, not a silent `as unknown as` cast.
//
// ── BUILD vs RUN: each function is a COMPILER, run at file-eval time ───────────────
// `grammar`/`extract`/`ttable`/`network`/`llmFn` are not passive stores — each is `node → Impl`.
// BUILD = evaluating the emitted `.js` (each heavy construct's line calls e.g.
// `rt.network(node, __reg)`, which compiles the node into a runnable Impl and registers it).
// RUN = calling a registered Impl. Late binding (compilers capture `resolve` but look leaves up
// at RUN time) makes BUILD order-independent: forward refs, mutual recursion, network→network.

import type { Impl, Registry, CompiledLeaf } from "../core/runtime-api.js";
import type { RecordDescriptor, LlmTypeEnv } from "../core/types.js";
import type { GrammarNode } from "../constructs/defgrammar/ast.js";
import type { TTableNode } from "../constructs/ttable/ast.js";
import type { ExtractNode } from "../constructs/defextract/ast.js";
import type { NetworkNode } from "../constructs/defnetwork/ast.js";
import type { LlmFnNode } from "../constructs/defllmfn/ast.js";

export interface ConstructRuntime {
  // defgrammar — compile the grammar node into a String? → Record? (or [Record?]) leaf. `record`
  // is the bound record's descriptor (the constructor stays late-bound via `resolve`); undefined
  // for a bare recognizer. Returns the leaf + (scan mode) its scan.
  grammar(node: GrammarNode, record: RecordDescriptor | undefined, resolve: Registry["resolve"]): CompiledLeaf;

  // defextract — build the constituency orchestrator. Leaf grammars/tables resolve by name
  // through `resolve` (impl) and `scanOf` (span-aware scan), so emit order is irrelevant.
  extract(node: ExtractNode, resolve: Registry["resolve"], scanOf: Registry["scanOf"]): Impl;

  // TTable — read a delimited text table into [Row?]. `record` is the row record's descriptor.
  ttable(node: TTableNode, record: RecordDescriptor | undefined, resolve: Registry["resolve"]): CompiledLeaf;

  // defllmfn — an async, memoized LLM-backed leaf. `typeEnv` (the whole-program records + enums +
  // predicate fns) is passed ALONGSIDE the node — it's program context the reused `deriveProtocol`
  // needs for the structured-output schema, not part of the llmfn's own AST. Takes the `registry`
  // so `with: tools` resolves LATE against a host-injected resolver (falling back to parse-only).
  llmFn(node: LlmFnNode, typeEnv: LlmTypeEnv, registry: Registry): Impl;

  // defnetwork — COMPILE a propagator graph into an Impl that runs to a fixpoint when invoked.
  // Takes the whole `registry` (the engine NetworkRuntime needs impl AND arity per leaf).
  network(node: NetworkNode, registry: Registry): Impl;
}
