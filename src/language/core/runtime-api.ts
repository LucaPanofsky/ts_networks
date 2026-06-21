// ── The runtime boundary: what emitted code is allowed to call ────────────────────
//
// This is the FROZEN CORE surface. Every `.js` file the emitter produces begins with
//
//     import * as rt from "@tsn/runtime";
//
// and may call only what `RuntimeApi` below declares. Nothing else crosses the line.
// The discipline that makes the whole approach pay off:
//
//   • the runtime is the FIXED part of the system — versioned, audited, trusted;
//   • the emitted `.js` is the VARIABLE part — one compiled program, portable to
//     anywhere this runtime is present (the "compile once, run anywhere" artifact).
//
// So keep this surface SMALL and STABLE. Every function added here is a new thing
// emitted files depend on forever; a removed/changed one breaks every prior artifact.
// When in doubt, push logic into the emitted source (which is regenerable) rather than
// into the runtime (which is not).
//
// ── BUILD vs RUN: the construct functions are COMPILERS, run at file-eval time ─────
//
// The single fact most easily lost: `grammar` / `extract` / `network` / `llmFn` are
// not passive stores — each is a COMPILER, `spec → Impl`. There is no separate "now
// compile the networks" phase, because the compile calls ARE lines in the emitted file.
//
//   BUILD phase = evaluating the .js module (import()/eval). Top to bottom:
//                 pure constructs define a JS fn and register it; heavy constructs call
//                 e.g. `rt.network(spec, __reg.resolve)`, which COMPILES the spec into a
//                 runnable Impl, and register that. When eval finishes, every network is
//                 already compiled and sitting in the registry as a callable. Evaluating
//                 the file therefore both produces the registry AND compiles everything;
//                 it does NOT run anything.
//
//   RUN phase   = calling a registered Impl, e.g. `__reg.resolve("network/foo")(args)`.
//                 Only now does a propagator graph execute to a fixpoint. (To a
//                 propagator, `network/foo` resolves exactly like any other leaf — a
//                 network is just a registry entry whose impl runs a graph.)
//
// Late binding is what makes BUILD order-independent: a compiler captures `resolve` but
// looks up its leaves only at RUN time. So a network may be compiled before the fn it
// calls is registered — forward refs, mutual recursion, network→network all just work,
// and emitted fragments may appear in any order.
//
// EAGER to start: `network` builds its full graph structure at the `rt.network` call
// (eval time), capturing `resolve` for leaves — this mirrors the existing buildNetworks
// / astToDataNetwork / NetworkRuntime path. Lazy+memoized compilation (build the graph
// on first call, cache it) is a later optimization, not a correctness requirement; the
// boundary holds either way.
//
// Status: first cut. A boundary to refine, not a final ABI.

import type { Morphism, TypeRef, ScanMatch, RecordDescriptor, LlmTypeEnv } from "./types.js";

// ── Foundational value protocol (the merge algebra) ───────────────────────────────
// The crown jewel. Emitted code never reimplements merge; it calls into it. `Info` is
// an information-bearing value (Something / Nothing / Contradiction); `merge` is its
// least-upper-bound combine, yielding a Contradiction on irreconcilable clash.
export type Info = unknown; // sketch: the real type is the info-structure value

export interface ValueProtocol {
  merge(a: Info, b: Info): Info;
  something(value: unknown): Info;
  readonly nothing: Info;
  contradiction(reason: string, ...evidence: unknown[]): Info;
}

// ── The registry: how named bindings find each other at run time ──────────────────
// A leaf callable. (Async leaves — llmfn — return a promise-like Info; the engine
// awaits them.)
export type Impl = (...args: unknown[]) => Info;

export type RegistryEntry = {
  arity: number;
  impl: Impl;
  morphism: Morphism;
  // Scan-mode grammar leaves only: the span-aware matcher. A `defextract` needs each
  // grammar leaf's `scan` (records + consumed spans) for span-scoped nested recursion —
  // richer than the plain `impl`. Plain leaves (fns, ttables, parse-mode grammars) omit it.
  scan?: (input: unknown) => ScanMatch[];
};

export interface Registry {
  register(key: string, entry: RegistryEntry): void;
  // Late-bound lookup. Returns a callable that resolves `key` when invoked, so a
  // reference can be emitted before the target is registered (forward/cyclic refs).
  resolve(key: string): Impl;
  // The `scan` of a registered leaf, or undefined. Late-bound (read at call time), so a
  // `defextract` compiled before its grammars still sees their scans at RUN time.
  scanOf(key: string): ((input: unknown) => ScanMatch[]) | undefined;
}

// What `grammar`/`ttable` compile to: a leaf callable plus (grammars only) its scan.
export type CompiledLeaf = { arity: number; impl: Impl; scan?: (input: unknown) => ScanMatch[] };

// ── Host helpers the emitted module binds at the top ───────────────────────────────
// `interp` backs an `interpolate` body. The emitted `compileExpr` lowers such a body to
// a bare `__interp(template, { root: root, … })` call (the roots are the function's own
// parameters), so the module preamble binds `const __interp = rt.interp;`. It is a host
// closure (it renders through the same template engine as `defllmfn` prompts) and so
// cannot be emitted as source — exactly the kind of thing this frozen surface exists for.
export type Interp = (template: string, args: Record<string, unknown>) => string;

// ── Construct runtimes: the heavy machinery the pure layer doesn't need ───────────
// Pure constructs (record, fn, predicate, enum) emit plain JS and touch only the
// registry. These four are what the rest of the surface exists for: each takes an
// inlined spec (emitted as a data literal) and returns a callable leaf.
export interface ConstructRuntime {
  // defgrammar — compile Ohm source into a String? → Record? (or [Record?]) leaf. `record`
  // is the bound record's inlined descriptor (the constructor stays late-bound via
  // `resolve`); undefined for a bare recognizer. Returns the leaf + (scan mode) its scan.
  grammar(spec: GrammarSpec, record: RecordDescriptor | undefined, resolve: Registry["resolve"]): CompiledLeaf;

  // defextract — build the constituency orchestrator. Leaf grammars/tables are resolved by
  // name through `resolve` (impl) and `scanOf` (span-aware scan), so the extract and its
  // leaves stay independent fragments and late binding makes emit order irrelevant.
  extract(spec: ExtractSpec, resolve: Registry["resolve"], scanOf: Registry["scanOf"]): Impl;

  // defttable — read a delimited text table into [Row?]. `record` is the row record's
  // inlined descriptor (constructor late-bound via `resolve`).
  ttable(spec: TTableSpec, record: RecordDescriptor | undefined, resolve: Registry["resolve"]): CompiledLeaf;

  // defllmfn — an async, memoized LLM-backed leaf. The spec is self-contained: the `with:`
  // clause carries the model (and max_tokens/tools), and the type environment is inlined so
  // the reused engine `deriveProtocol` can build the structured-output schema. The API key
  // is ambient (env, via the engine's `getClient()`) — never emitted into the file. Takes the
  // `registry` so `with: tools` can resolve LATE against a host-injected resolver (the full
  // program-reasoning toolset), falling back to the sandbox parse-only resolver when unset.
  llmFn(spec: LlmFnSpec, registry: Registry): Impl;

  // defnetwork — COMPILE a propagator graph into an Impl that runs the graph to a fixpoint
  // when invoked. Takes the whole `registry` (not just `resolve`) because the reused engine
  // NetworkRuntime needs the engine registry — impl AND arity per leaf — to wire propagators.
  // Construction is deferred to first invoke (by which point every leaf is registered), which
  // is what makes emit order, recursion, and mutual network reference all resolve correctly.
  network(spec: NetworkSpec, registry: Registry): Impl;
}

// The whole surface emitted code sees behind the `rt` alias.
export interface RuntimeApi extends ValueProtocol, ConstructRuntime {
  // A fresh registry for one compiled program. The emitted module does:
  //   const __reg = rt.registry();  …register every binding…  export default __reg;
  registry(): Registry;

  // The interpolation renderer an `interpolate` body lowers to (see `Interp`).
  interp: Interp;
}

// ── Spec shapes ─────────────────────────────────────────────────────────────────
// What the emitter inlines as JS data literals — the construct's node minus the parts
// emitted inline. The grammar/extract/ttable specs mirror their construct AST nodes
// (GrammarNode/ExtractNode/TTableNode), which they are structurally cast to in the runtime
// adapter. The network/llmfn specs are looser (the subset the adapter reads); the adapter casts
// the inlined node to NetworkNode/LlmFnNode.
export type GrammarSpec = {
  kind: string;
  name: string;
  source: string;
  signature?: { params: { predicate: string; name: string }[]; returnType: TypeRef };
};

export type TTableSpec = {
  kind: string;
  name: string;
  row: string;
  cell: string;
  headers: { field: string; text?: string }[];
};

export type ExtractWithinSpec = { kind: "within"; target: string; grammar?: string; body: ExtractStmtSpec[] };
export type ExtractBindSpec = { kind: "scan" | "parse"; record: string; as: string; grammar: string };
export type ExtractStmtSpec = ExtractWithinSpec | ExtractBindSpec;
export type ExtractSpec = { kind: string; name: string; root: ExtractWithinSpec };

// What a `defnetwork` inlines — its node, structurally the NetworkNode (the runtime adapter
// casts through). `terms` stay opaque here (the four term-kind shapes live in
// the construct module); the adapter only reads the signature directly.
export type NetworkSpec = {
  kind: string;
  name: string;
  signature: { from: string[]; to: string };
  terms: unknown[];
};

// What a `defllmfn` inlines — its node (structurally the LlmFnNode) plus the
// program's type environment, so `rt.llmFn` can reuse `deriveProtocol` verbatim. `config`
// is the `with:` clause (model / max_tokens / tools); `user`/`system` are the rendered-at-
// run-time prompt templates (the system channel is stable, the user channel data-bearing).
export type LlmFnSpec = {
  kind: string;
  name: string;
  params: { predicate: string; name: string }[];
  returnType: TypeRef;
  user: string;
  system?: string;
  config: Record<string, string>;
  typeEnv: LlmTypeEnv;
};
