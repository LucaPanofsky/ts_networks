// The codebase taxonomy: "module" = a first-level subdirectory under src/, plus the
// handful of loose root files (each its own one-file module). Everything the analysis
// computes is keyed off this hand-written manifest — the one place that needs a human
// when the layout changes.
//
// `kind` drives reporting, not measurement:
//   core    — algebra + central wiring. The merge / I / naryUnpacking algebra is
//             given-and-correct (off-limits); we want to SEE these but not refactor them.
//   runtime — the DSL frontend + propagator engine + sandbox + operations.
//   tooling — entrypoints and adapters (cli, mcp).
//   stale   — the abandoned UI. Excluded from the hotspot ranking so it doesn't masquerade
//             as "untested weak code" worth attention.

export type ModuleKind = "core" | "runtime" | "tooling" | "stale";

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

  // ---- tooling ----
  { name: "mcp", dir: "src/mcp", kind: "tooling" },
];
