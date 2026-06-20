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

import type { Morphism } from "./types.js";

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
};

export interface Registry {
  register(key: string, entry: RegistryEntry): void;
  // Late-bound lookup. Returns a callable that resolves `key` when invoked, so a
  // reference can be emitted before the target is registered (forward/cyclic refs).
  resolve(key: string): Impl;
}

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
  // defgrammar — compile Ohm source into a String? → Record? (or [Record?]) leaf.
  grammar(ohmSource: string, opts: { scan: boolean; returns: string }): Impl;

  // defextract — build the constituency orchestrator. Leaf grammars are resolved by
  // name through `resolve` (so the extract and its grammars are independent fragments).
  extract(spec: ExtractSpec, resolve: Registry["resolve"]): Impl;

  // defttable — read a delimited text table into records. (No module yet; here so the
  // boundary anticipates it.)
  ttable(spec: TTableSpec): Impl;

  // defllmfn — an async, memoized LLM-backed leaf. Config (model, key) is injected by
  // the host, never emitted into the file.
  llmFn(spec: LlmFnSpec, config: LlmConfig): Impl;

  // defnetwork — COMPILE a propagator graph (eagerly, at this call) into an Impl that
  // runs the graph to a fixpoint when invoked. Referenced leaves (fns, grammars, other
  // networks) are resolved by name through `resolve`; late binding is what makes
  // recursion and mutual reference work despite eager compilation.
  network(spec: NetworkSpec, resolve: Registry["resolve"]): Impl;
}

// The whole surface emitted code sees behind the `rt` alias.
export interface RuntimeApi extends ValueProtocol, ConstructRuntime {
  // A fresh registry for one compiled program. The emitted module does:
  //   const __reg = rt.registry();  …register every binding…  export default __reg;
  registry(): Registry;

  // The interpolation renderer an `interpolate` body lowers to (see `Interp`).
  interp: Interp;
}

// ── Spec shapes (sketch) ──────────────────────────────────────────────────────────
// These are what the emitter inlines as JS data literals. Kept loose for now; they
// will firm up to mirror the construct AST nodes (which is the point — the spec a
// runtime call receives is essentially the node minus the parts emitted inline).
export type ExtractSpec = unknown;
export type TTableSpec = unknown;
export type NetworkSpec = unknown;
export type LlmFnSpec = unknown;
export type LlmConfig = { model: string; [k: string]: unknown };
