// Pure core of the maintenance analysis. Everything here is a total function over
// already-gathered raw data (no fs, no git, no I/O) so the assignment + aggregation logic
// — the only genuinely tricky part — is unit-testable in isolation. The imperative shell
// (gather.ts) supplies the per-file numbers; this layer maps each file to its module and
// rolls them up.

import type { ModuleDef, ModuleKind } from "./manifest.js";

// ---- raw per-file inputs (produced by the shell) ----
export interface SrcFile {
  path: string; // src-relative
  loc: number;
  risk: number; // count of risk markers (as any, @ts-ignore, TODO/FIXME, ...)
}
export interface TestFile {
  path: string; // tests-relative
  loc: number;
}
export interface FileEdge {
  from: string; // src-relative importer
  to: string; // src-relative imported
}
export interface FileChurn {
  path: string; // src-relative
  commits: number;
  churn: number; // lines added + deleted across history
}
export interface FileCoverage {
  path: string; // src-relative
  covered: number; // covered statements
  total: number; // total statements
}

// ---- rolled-up per-module output ----
export interface ModuleMetrics {
  name: string;
  kind: ModuleKind;
  offLimits: boolean;
  files: number;
  srcLoc: number;
  testLoc: number;
  ratio: number; // testLoc / srcLoc
  fanIn: number; // # of OTHER modules importing this one
  fanOut: number; // # of OTHER modules this one imports
  instability: number; // fanOut / (fanIn + fanOut), Martin's metric; 0 when isolated
  commits: number;
  churn: number;
  coverage: number | null; // 0..1 statement coverage, null when no data
  risk: number;
}

export interface MetricsResult {
  modules: ModuleMetrics[];
  moduleEdges: FileEdge[]; // deduped module-level edges (from/to are module names)
  cycles: string[][];
  unassigned: { src: string[]; test: string[] };
}

/** Rewrite a tests/ path to the src/ path it mirrors: tests/a/b.test.ts -> src/a/b.ts. */
function mirrorToSrc(p: string): string {
  if (p.startsWith("tests/")) {
    return "src/" + p.slice("tests/".length).replace(/\.test\.ts$/, ".ts");
  }
  return p;
}

/**
 * Which module does a source-or-test path belong to? Returns the module name or null.
 * Test paths are matched through their mirrored src path; explicit `tests` attachments on
 * a module win first (for cross-cutting test files that don't mirror a directory).
 * Most-specific (longest dir) match wins, so `info-structure.ts` is never swallowed by the
 * `information-structures/` directory.
 */
export function moduleOf(path: string, modules: ModuleDef[]): string | null {
  const p = path.replace(/^\.\//, "");
  for (const m of modules) {
    if (m.tests?.includes(p)) return m.name;
  }
  const norm = mirrorToSrc(p);
  let best: ModuleDef | null = null;
  for (const m of modules) {
    const isFile = m.dir.endsWith(".ts");
    const hit = isFile ? norm === m.dir : norm.startsWith(m.dir + "/");
    if (hit && (!best || m.dir.length > best.dir.length)) best = m;
  }
  return best ? best.name : null;
}

/** Tarjan's strongly-connected components; returns only components with > 1 node (cycles). */
export function detectCycles(edges: FileEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  let idx = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  const connect = (v: string): void => {
    index.set(v, idx);
    low.set(v, idx);
    idx++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp.sort());
    }
  };
  for (const v of [...nodes].sort()) if (!index.has(v)) connect(v);
  return sccs;
}

export interface ComputeInput {
  modules: ModuleDef[];
  srcFiles: SrcFile[];
  testFiles: TestFile[];
  edges: FileEdge[]; // file-level, resolved to src-relative paths
  churn: FileChurn[];
  coverage: FileCoverage[] | null;
}

/** Roll per-file raw data up to per-module metrics + the module graph + cycles. */
export function computeMetrics(input: ComputeInput): MetricsResult {
  const { modules, srcFiles, testFiles, edges, churn, coverage } = input;

  interface Acc {
    files: number;
    srcLoc: number;
    testLoc: number;
    commits: number;
    churn: number;
    covered: number;
    total: number;
    hasCoverage: boolean;
    risk: number;
    importsTo: Set<string>; // module names this module imports
    importedBy: Set<string>;
  }
  const acc = new Map<string, Acc>();
  for (const m of modules) {
    acc.set(m.name, {
      files: 0, srcLoc: 0, testLoc: 0, commits: 0, churn: 0,
      covered: 0, total: 0, hasCoverage: false, risk: 0,
      importsTo: new Set(), importedBy: new Set(),
    });
  }
  const unassigned = { src: [] as string[], test: [] as string[] };

  for (const f of srcFiles) {
    const m = moduleOf(f.path, modules);
    if (!m) { unassigned.src.push(f.path); continue; }
    const a = acc.get(m)!;
    a.files += 1;
    a.srcLoc += f.loc;
    a.risk += f.risk;
  }
  for (const f of testFiles) {
    const m = moduleOf(f.path, modules);
    if (!m) { unassigned.test.push(f.path); continue; }
    acc.get(m)!.testLoc += f.loc;
  }
  for (const c of churn) {
    const m = moduleOf(c.path, modules);
    if (!m) continue;
    const a = acc.get(m)!;
    a.commits += c.commits;
    a.churn += c.churn;
  }
  if (coverage) {
    for (const cov of coverage) {
      const m = moduleOf(cov.path, modules);
      if (!m) continue;
      const a = acc.get(m)!;
      a.covered += cov.covered;
      a.total += cov.total;
      a.hasCoverage = true;
    }
  }

  // module graph: collapse file edges, drop intra-module and unresolved edges
  const moduleEdgeSet = new Set<string>();
  for (const e of edges) {
    const from = moduleOf(e.from, modules);
    const to = moduleOf(e.to, modules);
    if (!from || !to || from === to) continue;
    moduleEdgeSet.add(from + " " + to);
    acc.get(from)!.importsTo.add(to);
    acc.get(to)!.importedBy.add(from);
  }
  const moduleEdges: FileEdge[] = [...moduleEdgeSet].map((s) => {
    const sp = s.indexOf(" ");
    return { from: s.slice(0, sp), to: s.slice(sp + 1) };
  });

  const result: ModuleMetrics[] = modules.map((m) => {
    const a = acc.get(m.name)!;
    const fanIn = a.importedBy.size;
    const fanOut = a.importsTo.size;
    return {
      name: m.name,
      kind: m.kind,
      offLimits: m.offLimits ?? false,
      files: a.files,
      srcLoc: a.srcLoc,
      testLoc: a.testLoc,
      ratio: a.srcLoc > 0 ? a.testLoc / a.srcLoc : 0,
      fanIn,
      fanOut,
      instability: fanIn + fanOut > 0 ? fanOut / (fanIn + fanOut) : 0,
      commits: a.commits,
      churn: a.churn,
      coverage: a.hasCoverage && a.total > 0 ? a.covered / a.total : null,
      risk: a.risk,
    };
  });

  return { modules: result, moduleEdges, cycles: detectCycles(moduleEdges), unassigned };
}

export interface Hotspot {
  name: string;
  score: number; // 0..100, higher = look here first
  srcLoc: number;
  churn: number;
  coverage: number | null;
  ratio: number;
  fanIn: number;
  reasons: string[];
}

/**
 * Rank modules by the hotspot triad — high churn × under-tested × high blast-radius, with
 * size as a minor amplifier. Off-limits algebra is ranked but flagged so it's never mistaken
 * for a refactor target. Each component is normalized 0..1 across the modules, so the score is
 * relative to THIS codebase.
 */
export function hotspotRank(metrics: ModuleMetrics[]): Hotspot[] {
  const maxOf = (sel: (m: ModuleMetrics) => number): number =>
    Math.max(1, ...metrics.map(sel));
  const mChurn = maxOf((m) => m.churn);
  const mLoc = maxOf((m) => m.srcLoc);
  const mFanIn = maxOf((m) => m.fanIn);

  const hs = metrics.map((m): Hotspot => {
    const churnN = m.churn / mChurn;
    const locN = m.srcLoc / mLoc;
    const blast = m.fanIn / mFanIn;
    const testGap =
      m.coverage != null ? 1 - m.coverage : Math.max(0, 1 - Math.min(1, m.ratio));
    const score = 100 * (0.35 * churnN + 0.15 * locN + 0.3 * testGap + 0.2 * blast);

    const reasons: string[] = [];
    if (churnN > 0.6) reasons.push("high churn");
    if (testGap > 0.5) reasons.push(m.coverage != null ? "low coverage" : "thin tests");
    if (blast > 0.6) reasons.push("high blast-radius");
    if (locN > 0.6) reasons.push("large");
    if (m.offLimits) reasons.push("⚠ algebra — change only with permission");

    return {
      name: m.name,
      score,
      srcLoc: m.srcLoc,
      churn: m.churn,
      coverage: m.coverage,
      ratio: m.ratio,
      fanIn: m.fanIn,
      reasons,
    };
  });

  return hs.sort((a, b) => b.score - a.score);
}
