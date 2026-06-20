import {
  moduleOf,
  detectCycles,
  computeMetrics,
  hotspotRank,
  type SrcFile,
  type TestFile,
  type FileEdge,
  type FileChurn,
  type FileCoverage,
  type ModuleMetrics,
} from "../../repo_workspace/analysis/metrics.js";
import type { ModuleDef } from "../../repo_workspace/analysis/manifest.js";

// A small synthetic taxonomy keeps the pure-logic tests deterministic and independent of
// the real manifest (which changes as the codebase does).
const MODULES: ModuleDef[] = [
  { name: "info-structure", dir: "src/info-structure.ts", kind: "core", offLimits: true,
    tests: ["tests/algebraic-properties-1.test.ts"] },
  { name: "information-structures", dir: "src/information-structures", kind: "core" },
  { name: "sandbox", dir: "src/sandbox", kind: "runtime" },
  { name: "operations", dir: "src/operations", kind: "runtime" },
];

describe("moduleOf — path → module assignment", () => {
  test("a file inside a directory module is assigned to it", () => {
    expect(moduleOf("src/sandbox/jsgen/runtime.ts", MODULES)).toBe("sandbox");
  });

  test("a loose-file module matches exactly, not by prefix", () => {
    expect(moduleOf("src/info-structure.ts", MODULES)).toBe("info-structure");
  });

  // NEGATIVE / the disambiguation that motivates most-specific matching: the singular file
  // `info-structure.ts` and the plural directory `information-structures/` must not collide.
  test("info-structure.ts is not swallowed by the information-structures/ directory", () => {
    expect(moduleOf("src/information-structures/merge-set.ts", MODULES)).toBe(
      "information-structures",
    );
    expect(moduleOf("src/info-structure.ts", MODULES)).toBe("info-structure");
  });

  test("a test path is matched through its mirrored src directory", () => {
    expect(moduleOf("tests/sandbox/tools.test.ts", MODULES)).toBe("sandbox");
  });

  test("an explicitly-attached cross-cutting test file wins", () => {
    expect(moduleOf("tests/algebraic-properties-1.test.ts", MODULES)).toBe("info-structure");
  });

  test("an unmatched path is unassigned (null), not silently bucketed", () => {
    expect(moduleOf("tests/i-idempotent.test.ts", MODULES)).toBeNull();
    expect(moduleOf("src/nowhere/x.ts", MODULES)).toBeNull();
  });
});

describe("detectCycles", () => {
  test("a two-module import cycle is reported", () => {
    const edges: FileEdge[] = [
      { from: "sandbox", to: "operations" },
      { from: "operations", to: "sandbox" },
    ];
    expect(detectCycles(edges)).toEqual([["operations", "sandbox"]]);
  });

  test("an acyclic graph reports no cycles", () => {
    const edges: FileEdge[] = [
      { from: "operations", to: "sandbox" },
      { from: "sandbox", to: "info-structure" },
    ];
    expect(detectCycles(edges)).toEqual([]);
  });
});

describe("computeMetrics — aggregation", () => {
  const srcFiles: SrcFile[] = [
    { path: "src/sandbox/tools.ts", loc: 100, risk: 2 },
    { path: "src/sandbox/jsgen/runtime.ts", loc: 50, risk: 1 },
    { path: "src/operations/run.ts", loc: 40, risk: 0 },
    { path: "src/info-structure.ts", loc: 200, risk: 0 },
  ];
  const testFiles: TestFile[] = [
    { path: "tests/sandbox/tools.test.ts", loc: 75 },
    { path: "tests/operations/run.test.ts", loc: 80 },
  ];
  const edges: FileEdge[] = [
    { from: "src/sandbox/tools.ts", to: "src/operations/run.ts" },
    { from: "src/operations/run.ts", to: "src/sandbox/jsgen/runtime.ts" }, // back-edge → cycle
    { from: "src/sandbox/tools.ts", to: "src/sandbox/jsgen/runtime.ts" }, // intra-module, dropped
  ];
  const churn: FileChurn[] = [
    { path: "src/sandbox/tools.ts", commits: 10, churn: 500 },
    { path: "src/operations/run.ts", commits: 3, churn: 90 },
  ];

  test("src LOC, file count, risk and test LOC roll up per module; ratio is testLoc/srcLoc", () => {
    const r = computeMetrics({ modules: MODULES, srcFiles, testFiles, edges, churn, coverage: null });
    const sandbox = r.modules.find((m) => m.name === "sandbox")!;
    expect(sandbox.srcLoc).toBe(150);
    expect(sandbox.files).toBe(2);
    expect(sandbox.risk).toBe(3);
    expect(sandbox.testLoc).toBe(75);
    expect(sandbox.ratio).toBeCloseTo(75 / 150);
    expect(sandbox.churn).toBe(500);
    expect(sandbox.commits).toBe(10);
  });

  test("the module graph drops intra-module edges and computes fan-in/out + a cycle", () => {
    const r = computeMetrics({ modules: MODULES, srcFiles, testFiles, edges, churn, coverage: null });
    // sandbox <-> operations mutually import → both fanIn=1, fanOut=1, and a cycle.
    const sandbox = r.modules.find((m) => m.name === "sandbox")!;
    const operations = r.modules.find((m) => m.name === "operations")!;
    expect(sandbox.fanOut).toBe(1);
    expect(sandbox.fanIn).toBe(1);
    expect(operations.fanIn).toBe(1);
    expect(r.cycles).toEqual([["operations", "sandbox"]]);
  });

  test("coverage aggregates by statement counts, not by averaging percentages", () => {
    const coverage: FileCoverage[] = [
      { path: "src/sandbox/tools.ts", covered: 90, total: 100 }, // 90%
      { path: "src/sandbox/jsgen/runtime.ts", covered: 0, total: 50 }, // 0%
    ];
    const r = computeMetrics({ modules: MODULES, srcFiles, testFiles, edges, churn, coverage });
    const sandbox = r.modules.find((m) => m.name === "sandbox")!;
    // statement-weighted = 90/150 = 0.60, NOT the simple mean of (0.9, 0.0) = 0.45.
    expect(sandbox.coverage).toBeCloseTo(90 / 150);
    expect(sandbox.coverage).not.toBeCloseTo(0.45);
  });

  test("coverage is null for a module with no coverage data", () => {
    const r = computeMetrics({ modules: MODULES, srcFiles, testFiles, edges, churn, coverage: [] });
    expect(r.modules.find((m) => m.name === "info-structure")!.coverage).toBeNull();
  });

  test("files outside every module land in the unassigned bucket, not a module", () => {
    const r = computeMetrics({
      modules: MODULES,
      srcFiles: [...srcFiles, { path: "src/nowhere/x.ts", loc: 999, risk: 0 }],
      testFiles: [...testFiles, { path: "tests/i-idempotent.test.ts", loc: 12 }],
      edges, churn, coverage: null,
    });
    expect(r.unassigned.src).toContain("src/nowhere/x.ts");
    expect(r.unassigned.test).toContain("tests/i-idempotent.test.ts");
    expect(r.modules.every((m) => m.srcLoc !== 999)).toBe(true);
  });
});

describe("hotspotRank", () => {
  const mk = (over: Partial<ModuleMetrics>): ModuleMetrics => ({
    name: "x", kind: "runtime", offLimits: false, files: 1, srcLoc: 100, testLoc: 0,
    ratio: 1, fanIn: 0, fanOut: 0, instability: 0, commits: 1, churn: 0, coverage: 1, risk: 0,
    ...over,
  });

  test("a churny, under-tested, depended-on module outranks a calm well-tested leaf", () => {
    const hot = mk({ name: "hot", churn: 1000, coverage: 0.1, fanIn: 8, srcLoc: 500 });
    const calm = mk({ name: "calm", churn: 5, coverage: 0.95, fanIn: 0, srcLoc: 80 });
    const ranked = hotspotRank([calm, hot]);
    expect(ranked[0]!.name).toBe("hot");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  test("stale modules are excluded from the ranking", () => {
    const stale = mk({ name: "old", kind: "stale", churn: 9999, coverage: 0, fanIn: 9 });
    const live = mk({ name: "live", churn: 1 });
    const ranked = hotspotRank([stale, live]);
    expect(ranked.map((h) => h.name)).toEqual(["live"]);
  });

  test("off-limits algebra is ranked but flagged so it is never mistaken for a target", () => {
    const algebra = mk({ name: "info-structure", kind: "core", offLimits: true, churn: 800, coverage: 0.2, fanIn: 9 });
    const ranked = hotspotRank([algebra]);
    expect(ranked[0]!.reasons.some((r) => r.includes("algebra"))).toBe(true);
  });
});
