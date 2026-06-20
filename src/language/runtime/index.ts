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
import { renderPrompt } from "../../sandbox/prompt-template.js";
import { compileGrammar } from "../../sandbox/grammar-runtime.js";
import { compileTTable } from "../../sandbox/ttable-runtime.js";
import { compileExtract, type GrammarLeaves } from "../../sandbox/extract-runtime.js";
import type { Sandbox } from "../../sandbox/jsgen/runtime.js";
import type {
  GrammarAST,
  TTableAST,
  ExtractAST,
  ProgramAST,
  RecordAST,
} from "../../data-network/types.js";
import type { Registry, RegistryEntry, Impl, CompiledLeaf, GrammarSpec, TTableSpec, ExtractSpec, ExtractWithinSpec } from "../core/runtime-api.js";
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

export function registry(): Registry {
  const backing = createRegistry();
  // The existing engine's registry entry has no `scan` field, so the scan-mode grammar
  // leaves keep theirs in a sibling map alongside the backing registry. Read late (at RUN
  // time) by `scanOf`, so a `defextract` compiled before its grammars still finds them.
  const scans = new Map<string, (input: unknown) => ScanMatch[]>();
  return {
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

// The engine compilers read only `program.records`; the other collections are unused here.
function programWith(records: RecordAST[]): ProgramAST {
  return {
    networks: [], records, fns: [], derives: [], llmFns: [],
    enums: [], grammars: [], extracts: [], ttables: [], parameters: [],
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
  const compiled = compileGrammar(spec as unknown as GrammarAST, programWith(records), sandbox);
  return { arity: compiled.arity, impl: compiled.impl, scan: compiled.scan };
}

export function ttable(
  spec: TTableSpec,
  record: RecordDescriptor | undefined,
  resolve: Registry["resolve"],
): CompiledLeaf {
  const { records, sandbox } = recordEnv(record, resolve);
  const compiled = compileTTable(spec as unknown as TTableAST, programWith(records), sandbox);
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
