// ── The runtime boundary: what emitted code is allowed to call ────────────────────
//
// This is the FROZEN CORE surface. Every `.js` file the emitter produces begins with
//
//     import * as rt from "@tsn/runtime";
//
// and may call only what the runtime surface declares. This file holds the construct-AGNOSTIC
// part (the value protocol, the registry, interp). The construct compilers —
// `grammar`/`ttable`/`extract`/`network`/`llmFn` — name the construct node types (which `core/`
// may not import), so they live in `../runtime/contract.ts` as `ConstructRuntime`. The two
// halves together are the surface emitted code may call.
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

import type { Morphism, ScanMatch } from "./types.js";

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

