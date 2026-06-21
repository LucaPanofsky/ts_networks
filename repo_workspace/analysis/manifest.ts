// The codebase taxonomy: "module" = a first-level subdirectory under src/, plus the
// handful of loose root files (each its own one-file module). Everything the analysis
// computes is keyed off this hand-written manifest — the one place that needs a human
// when the layout changes.
//
// One exception to "first-level": the GavaLang DSL front end (`src/language/`) is large
// enough that we report it by its internal LAYERS (`core`/`constructs`/`pipeline`/`expr`/
// `runtime`) as separate modules, so the acyclic `core ← constructs ← pipeline` layering is
// visible and cycle-checkable. `moduleOf` resolves most-specific-dir-first, so a deeper
// `language-*` wins over the `language` catch-all (which collects the loose top-level files).
// Its tests live per-construct under `tests/language/`, which don't mirror the layer dirs, so
// each is attached to its layer explicitly via `tests` below.
//
// `kind` drives reporting, not measurement:
//   core    — algebra + central wiring. The merge / I / naryUnpacking algebra is
//             given-and-correct (off-limits); we want to SEE these but not refactor them.
//   runtime — the DSL frontend + propagator engine + sandbox + operations.
//   tooling — entrypoints and adapters (mcp).

export type ModuleKind = "core" | "runtime" | "tooling";

export interface ModuleDef {
  /** Display name. */
  name: string;
  /** src-relative directory, or a single ".ts" file for a loose-root module. */
  dir: string;
  kind: ModuleKind;
  /** Cross-cutting test files that don't sit under a mirrored tests/<dir>. tests/-relative. */
  tests?: string[];
  /** Algebra surface — change only with explicit permission. Flagged, never auto-suggested. */
  offLimits?: boolean;
}

export const MODULES: ModuleDef[] = [
  // ---- core: algebra + central wiring ----
  {
    name: "info-structure",
    dir: "src/info-structure.ts",
    kind: "core",
    offLimits: true,
    tests: ["tests/i-idempotent.test.ts", "tests/algebraic-properties-1.test.ts"],
  },
  {
    name: "nary-unpacking",
    dir: "src/nary-unpacking.ts",
    kind: "core",
    offLimits: true,
    tests: ["tests/nary-unpacking.test.ts"],
  },
  {
    name: "information-structures",
    dir: "src/information-structures",
    kind: "core",
    offLimits: true,
  },
  { name: "registry", dir: "src/registry.ts", kind: "core", tests: ["tests/registry.test.ts"] },
  { name: "index", dir: "src/index.ts", kind: "core" },

  // ---- runtime ----
  { name: "data-network", dir: "src/data-network", kind: "runtime" },
  { name: "network-impl", dir: "src/network-impl", kind: "runtime" },
  { name: "sandbox", dir: "src/sandbox", kind: "runtime" },
  { name: "operations", dir: "src/operations", kind: "runtime" },

  // ---- runtime: the GavaLang DSL front end, by internal layer (core ← constructs ← pipeline) ----
  { name: "language-core", dir: "src/language/core", kind: "runtime" },
  {
    name: "language-constructs",
    dir: "src/language/constructs",
    kind: "runtime",
    // The per-construct slice tests (each parses + emits + runs one construct end to end).
    tests: [
      "tests/language/defrecord.test.ts",
      "tests/language/defn.test.ts",
      "tests/language/enum.test.ts",
      "tests/language/derive.test.ts",
      "tests/language/grammar.test.ts",
      "tests/language/extract.test.ts",
      "tests/language/ttable.test.ts",
      "tests/language/llmfn.test.ts",
      "tests/language/parameter.test.ts",
      "tests/language/network.test.ts",
    ],
  },
  {
    name: "language-pipeline",
    dir: "src/language/pipeline",
    kind: "runtime",
    tests: ["tests/language/split.test.ts"],
  },
  {
    name: "language-expr",
    dir: "src/language/expr",
    kind: "runtime",
    tests: ["tests/language/compile-expr.test.ts", "tests/language/expr.test.ts"],
  },
  {
    name: "language-runtime",
    dir: "src/language/runtime",
    kind: "runtime",
    tests: ["tests/language/artifact.test.ts"],
  },
  // Shared grammar fragments (the single declaration-name rule + the fn-`Signature` block +
  // actions) interpolated into the construct grammars. A pure leaf (imports only core types +
  // ohm); its own module so it isn't lumped into the `language` catch-all below — which conflates
  // it with the entry `index.ts` and fabricates a (file-level non-existent) bucket cycle. Tested
  // indirectly via every construct's parse test.
  { name: "language-shared", dir: "src/language/shared", kind: "runtime" },
  // Catch-all for the loose top-level files (index/select/parse-strict/reserved-words);
  // parse-strict.test.ts mirrors here naturally. Sub-layers above win for their own dirs.
  { name: "language", dir: "src/language", kind: "runtime" },

  // ---- runtime: shared leaves ----
  // The `{{placeholder}}` grammar — a neutral leaf depended on by the engine, the front end,
  // and the sandbox (kept out of any of them so none form a cross-layer cycle).
  { name: "placeholders", dir: "src/placeholders.ts", kind: "runtime" },
  { name: "fs", dir: "src/fs", kind: "runtime" },
  { name: "pdf", dir: "src/pdf", kind: "runtime" },

  // ---- tooling ----
  { name: "mcp", dir: "src/mcp", kind: "tooling" },
];
