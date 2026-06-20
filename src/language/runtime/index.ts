// The @tsn/runtime implementation — slice 1.
//
// Decision: ADAPT the existing engine. This is a thin translation layer between the new
// pipeline's boundary (core/runtime-api.ts: `register(key, entry)` + late-bound
// `resolve(key) -> Impl`) and the existing registry (src/registry.ts: `register(entry)`
// with `entry.fnName`, `get(fnName) -> entry`). No algebra is reimplemented.
//
// Only `registry()` is provided here — that is all the pure (record/fn) path needs.
// The construct runtimes (`grammar`/`extract`/`network`/`llmFn`) arrive when those
// constructs do, each wrapping its existing engine counterpart.

import { createRegistry } from "../../registry.js";
import type { Registry as EngineRegistry } from "../../registry.js";
import { astToDataNetwork } from "../../data-network/ast-to-data-network.js";
import { NetworkRuntime } from "../../network-impl/runtime.js";
import { renderPrompt } from "../../sandbox/prompt-template.js";
import { compileGrammar } from "../../sandbox/grammar-runtime.js";
import { compileTTable } from "../../sandbox/ttable-runtime.js";
import { compileExtract, type GrammarLeaves } from "../../sandbox/extract-runtime.js";
import { canonicalKey } from "../../sandbox/canonical-key.js";
import { callLLMFn } from "../../sandbox/llmfn-client.js";
import { toolsFromConfig } from "../../sandbox/tools.js";
import type { ToolResolver } from "../../sandbox/tools.js";
import { deriveProtocol } from "../../data-network/schema.js";
import { Something, Contradiction } from "../../info-structure.js";
import { Deferred } from "../../information-structures/deferred.js";
import { APromise } from "../../information-structures/apromise.js";
import { defaultExecutor } from "../../network-impl/executor.js";
import type { Sandbox } from "../../sandbox/record-sandbox.js";
import type {
  GrammarAST,
  TTableAST,
  ExtractAST,
  ProgramAST,
  RecordAST,
  FnAST,
  EnumAST,
  Expr,
  TypeRef,
  DataNetworkAST,
} from "../../data-network/types.js";
import type { Registry, RegistryEntry, Impl, CompiledLeaf, GrammarSpec, TTableSpec, ExtractSpec, ExtractWithinSpec, LlmFnSpec, NetworkSpec } from "../core/runtime-api.js";
import type { ScanMatch, RecordDescriptor } from "../core/types.js";

// The interpolation renderer (see runtime-api.ts `Interp`). Reuses the existing pure
// `renderPrompt` — the same engine `defllmfn` prompts render through, so dotted-path /
// record→JSON / missing-key semantics are identical. A missing reference is a hard error:
// a well-typed program never hits it (the checker validates the paths), so it only fires
// on a path the checker could not see — fail loud rather than render a silent gap.
export function interp(template: string, args: Record<string, unknown>): string {
  const result = renderPrompt(template, args);
  if (!result.ok) {
    throw new Error(`interpolate: references undefined variable(s): ${result.missing.join(", ")}`);
  }
  return result.prompt;
}

// The modular Registry plus its backing engine registry. `network()` needs the engine
// `Registry` (impl AND arity per leaf) to build a NetworkRuntime — richer than the late-bound
// `resolve` thunk — so `registry()` exposes it here. Kept out of `core/runtime-api.ts` so that
// frozen surface stays engine-agnostic; only this engine-coupled adapter layer sees it.
// `toolResolver` is INJECTED by an operation host (run-compiled) after load, before any
// llmfn runs: it supplies the full program-reasoning toolset (run/typecheck/…) the engine
// `run` gives a `with: tools` clause. Left unset, an llmfn falls back to the sandbox
// parse-only resolver — so a standalone `node artifact.js` still resolves `with: tools='parse'`.
// Mutable (set post-load) and read LATE (at first invoke), so injection order is irrelevant.
export type AdaptedRegistry = Registry & {
  readonly backing: EngineRegistry;
  toolResolver?: ToolResolver;
};

export function registry(): AdaptedRegistry {
  const backing = createRegistry();
  // The `true?` gate predicate every predicate-less `switch` defaults to: astToDataNetwork
  // resolves "true?" from the registry when a `switch` carries no fnRef. The engine registered
  // it in buildRegistry; the modular runtime registers it here so a bare `switch` works in a
  // compiled artifact (and standalone) just as it did on the engine path.
  backing.register({ fnName: "true?", arity: 1, impl: (v: unknown) => v === true, morphism: { from: ["Any?"], to: "Boolean?" } });
  // The existing engine's registry entry has no `scan` field, so the scan-mode grammar
  // leaves keep theirs in a sibling map alongside the backing registry. Read late (at RUN
  // time) by `scanOf`, so a `defextract` compiled before its grammars still finds them.
  const scans = new Map<string, (input: unknown) => ScanMatch[]>();
  return {
    backing,
    register(key: string, entry: RegistryEntry): void {
      backing.register({
        fnName: key,
        impl: entry.impl as (...args: unknown[]) => unknown,
        arity: entry.arity,
        morphism: entry.morphism,
      });
      if (entry.scan) scans.set(key, entry.scan);
    },
    // Late-bound: returns a thunk that looks the key up at CALL time, so a reference
    // emitted before its target is registered (forward/cyclic) still resolves.
    resolve(key: string): Impl {
      return (...args: unknown[]) => {
        const found = backing.get(key);
        if (!found) throw new Error(`@tsn/runtime: unresolved registry key "${key}"`);
        return found.impl(...args);
      };
    },
    scanOf(key: string): ((input: unknown) => ScanMatch[]) | undefined {
      return scans.get(key);
    },
  };
}

// ── Heavy-construct adapters: ADAPT the existing engine compilers ──────────────────
// Each reuses `compile{Grammar,TTable,Extract}` verbatim, synthesizing the minimal inputs
// they want from the inlined spec + late-bound registry resolution. No Ohm capture/scan/
// orchestration logic is reimplemented.

// A minimal ProgramAST carrying only the type collections a reused compiler reads. Grammar/
// ttable need just `records`; `deriveProtocol` (for llmfn) also walks `enums` and predicate
// `fns`. Everything else stays empty.
function programWith(parts: { records?: RecordAST[]; enums?: EnumAST[]; fns?: FnAST[] }): ProgramAST {
  return {
    networks: [], records: parts.records ?? [], fns: parts.fns ?? [], derives: [], llmFns: [],
    enums: parts.enums ?? [], grammars: [], extracts: [], ttables: [], parameters: [],
  };
}

// A record descriptor → the engine's RecordAST (structurally identical) + a one-entry
// sandbox whose constructor is the LATE-BOUND registry thunk (only *called* at RUN time,
// so the record may be registered after this grammar/ttable is compiled).
function recordEnv(
  record: RecordDescriptor | undefined,
  resolve: Registry["resolve"],
): { records: RecordAST[]; sandbox: Sandbox } {
  if (!record) return { records: [], sandbox: {} };
  const ast: RecordAST = { kind: "record", name: record.name, fields: record.fields };
  return { records: [ast], sandbox: { [record.name]: resolve(record.name) } };
}

export function grammar(
  spec: GrammarSpec,
  record: RecordDescriptor | undefined,
  resolve: Registry["resolve"],
): CompiledLeaf {
  const { records, sandbox } = recordEnv(record, resolve);
  const compiled = compileGrammar(spec as unknown as GrammarAST, programWith({ records }), sandbox);
  return { arity: compiled.arity, impl: compiled.impl, scan: compiled.scan };
}

export function ttable(
  spec: TTableSpec,
  record: RecordDescriptor | undefined,
  resolve: Registry["resolve"],
): CompiledLeaf {
  const { records, sandbox } = recordEnv(record, resolve);
  const compiled = compileTTable(spec as unknown as TTableAST, programWith({ records }), sandbox);
  return { arity: compiled.arity, impl: compiled.impl };
}

// Every leaf ref the extract orchestrates: the root grammar plus each scan/parse target,
// gathered recursively (nested `within`s carry no grammar of their own).
function collectRefs(within: ExtractWithinSpec, acc: Set<string> = new Set()): Set<string> {
  if (within.grammar) acc.add(within.grammar);
  for (const stmt of within.body) {
    if (stmt.kind === "within") collectRefs(stmt, acc);
    else acc.add(stmt.grammar);
  }
  return acc;
}

export function extract(
  spec: ExtractSpec,
  resolve: Registry["resolve"],
  scanOf: Registry["scanOf"],
): Impl {
  const ast = spec as unknown as ExtractAST;
  const leaves: GrammarLeaves = {};
  for (const ref of collectRefs(spec.root)) {
    leaves[ref] = {
      impl: (...args: unknown[]) => resolve(ref)(...args),
      // Late-bound: a getter so the scan is fetched at RUN time (when processBody reads
      // it). Returns undefined for parse-mode grammars and TTables → the engine's `impl`
      // path. This is what makes the extract independent of leaf emit order.
      get scan() {
        return scanOf(ref);
      },
    };
  }
  return compileExtract(ast, leaves).impl;
}

// defllmfn — the async, memoized LLM-backed leaf. Unlike grammar/extract/ttable there is no
// standalone engine compiler; this leaf is built inline here, reusing every engine piece
// (`deriveProtocol`, `callLLMFn`, `toolsFromConfig`, the bounded `defaultExecutor`, and the
// `Deferred`/`APromise`/`Something`/`Contradiction` protocol). No algebra is reimplemented.
//
//   • protocol — the structured-output JSON schema, derived from the return type over the
//     inlined type env (records + enums + predicate fns).
//   • config — model / max_tokens / tools from the `with:` clause + the stable `system` prompt.
//   • memoize — a re-fire over identical inputs shares the in-flight APromise (one model
//     call, same reference), so re-merging the result can never self-contradict.
export function llmFn(spec: LlmFnSpec, reg: Registry): Impl {
  const program = programWith({
    records: spec.typeEnv.records.map((r) => ({ kind: "record", name: r.name, fields: r.fields })),
    enums: spec.typeEnv.enums.map((e) => ({ kind: "enum", name: e.name, values: e.values }) satisfies EnumAST),
    fns: spec.typeEnv.predicates.map(
      (p) => ({ kind: "fn", isPredicate: true, name: p.name, params: p.params, returnType: p.returnType, body: p.body as Expr }) satisfies FnAST,
    ),
  });
  const protocol = deriveProtocol(spec.returnType as TypeRef, program);
  const paramNames = spec.params.map((p) => p.name);
  const memo = new Map<string, APromise<unknown>>();
  // Resolve `with: tools` LATE — against the registry's injected resolver if a host set one
  // (the full program-reasoning toolset), else the sandbox parse-only `toolsFromConfig`. Built
  // once on first invoke, by which point any host injection has happened.
  let config: { model?: string; maxTokens?: number; tools: ReturnType<ToolResolver>; system?: string } | undefined;
  const ensureConfig = () =>
    (config ??= {
      model: spec.config["model"],
      maxTokens: spec.config["max_tokens"] !== undefined ? parseInt(spec.config["max_tokens"], 10) : undefined,
      tools: ((reg as AdaptedRegistry).toolResolver ?? toolsFromConfig)(spec.config["tools"]),
      system: spec.system,
    });
  return (...args: unknown[]) => {
    const key = canonicalKey(args);
    const cached = memo.get(key);
    if (cached) return cached;
    const cfg = ensureConfig();
    const namedArgs = Object.fromEntries(paramNames.map((n, i) => [n, args[i]]));
    const d = new Deferred<unknown>();
    const ap = new APromise(d);
    memo.set(key, ap);
    defaultExecutor
      .submit(() => callLLMFn(spec.user, namedArgs, protocol, cfg))
      .then((v) => d.resolve(new Something(v)))
      .catch((e) => d.resolve(new Contradiction("llmfn/error", new Set(), e)));
    return ap;
  };
}

// defnetwork — compile a propagator graph into a callable leaf. Reuses the engine's
// `astToDataNetwork` + `NetworkRuntime` VERBATIM (no algebra reimplemented). The returned
// Impl mirrors the engine's `buildNetworks` leaf: map positional args onto the signature's
// input cells, run the graph, and project the output cell's InfoStructure back, wrapped in an
// APromise (a network is an async leaf — `invokeAsync` handles both sync propagators and async
// llmfn / sub-network leaves uniformly).
//
// The NetworkRuntime is built LAZILY on FIRST INVOKE, not at this `rt.network` call. The
// engine builds runtimes only after the whole program's registry is populated; the modular
// pipeline emits fragments in source order, so a network may be emitted before its leaf fns.
// Deferring construction to first invoke — by which point the module has finished evaluating
// and every leaf (with its arity) is in the backing registry — makes emit order irrelevant
// and lets mutual recursion / network-as-leaf resolve through the registry. (runtime-api.ts
// sanctions lazy+memoized as a valid alternative to eager; here it is what buys order-independence.)
// A network leaf is a normal `Impl` (composable: maps positional args, returns the single
// OUTPUT cell), PLUS a `cells` accessor used by a TOP-LEVEL run: it seeds cells BY NAME and
// returns the FULL cell map. The accessor returns each cell's raw `knows()` (an InfoStructure
// or APromise); the caller projects them — so this engine-boundary file stays operations-
// agnostic, and the projection (`operations/project.ts`) is shared with the engine `run`,
// keeping artifact output identical to `run`. Both share the same lazy `NetworkRuntime`.
export type NetworkImpl = Impl & {
  cells: (inputs: Record<string, unknown>) => Promise<Map<string, unknown>>;
};

export function network(spec: NetworkSpec, reg: Registry): NetworkImpl {
  const ast = spec as unknown as DataNetworkAST;
  const inputCells = ast.signature.from;
  const outputCell = ast.signature.to;
  const engine = (reg as AdaptedRegistry).backing;
  let runtime: NetworkRuntime | undefined;
  const ensure = (): NetworkRuntime => (runtime ??= new NetworkRuntime(astToDataNetwork(ast), engine));
  const leaf = ((...args: unknown[]) => {
    const d = new Deferred<unknown>();
    const inputs: Record<string, unknown> = {};
    for (let i = 0; i < inputCells.length; i++) inputs[inputCells[i]!] = args[i];
    void (async () => {
      try {
        const res = await ensure().invokeAsync(inputs);
        if (res.type === "exit") {
          d.resolve(new Contradiction("network/contradiction", new Set(), res.reason));
          return;
        }
        // SETTLE the output cell: an async leaf (sub-network / llmfn) leaves an APromise in
        // the cell. A `network/<name>` leaf must present a settled InfoStructure — like every
        // other registry leaf — so we await it here rather than resolve with a nested APromise.
        const out = res.cells.get(outputCell)!.knows();
        d.resolve(out instanceof APromise ? await out.deferred.promise : out);
      } catch (e) {
        d.resolve(new Contradiction("network/error", new Set(), e));
      }
    })();
    return new APromise(d);
  }) as NetworkImpl;
  // Top-level all-cells run: seed BY NAME (any cell, not just signature inputs) and return
  // every cell's raw `knows()`. Mirrors the engine `run` (which iterates `result.cells`
  // regardless of done/exit, projecting each) — a contradicted cell surfaces as a
  // Contradiction here and is projected to `{ __contradiction }` by the caller.
  leaf.cells = async (inputs: Record<string, unknown>) => {
    const res = await ensure().invokeAsync(inputs);
    const out = new Map<string, unknown>();
    for (const [name, cell] of res.cells) out.set(name, cell.knows());
    return out;
  };
  return leaf;
}
