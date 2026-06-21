// Imperative shell: read the filesystem + git + (optional) coverage and produce the raw
// per-file numbers the pure core (metrics.ts) rolls up. Nothing here interprets — it only
// gathers. All paths are emitted repo-relative with posix separators.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import * as path from "node:path";
import type { SrcFile, TestFile, FileEdge, FileChurn, FileCoverage } from "./metrics.js";
import type { GitInfo } from "./provenance.js";

const ROOT = process.cwd();

/** Run a git command, returning trimmed stdout or null if git fails / isn't available. */
function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Branch / commit / date / dirty for the working tree the report describes. Every field is
 * best-effort — a non-git context (or detached HEAD) degrades to nulls rather than throwing,
 * so the report still generates and the header shows em dashes.
 */
export function gatherGitInfo(): GitInfo {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = git(["rev-parse", "HEAD"]);
  const shortCommit = git(["rev-parse", "--short", "HEAD"]);
  const commitDate = git(["log", "-1", "--format=%cs"]); // %cs = committer date, YYYY-MM-DD
  const status = git(["status", "--porcelain"]);
  return {
    branch: branch || null,
    commit: commit || null,
    shortCommit: shortCommit || null,
    commitDate: commitDate || null,
    dirty: status != null && status.length > 0,
  };
}

/** Recursively list files under `dir` (repo-relative) matching `keep`. */
function walk(dir: string, keep: (p: string) => boolean): string[] {
  const out: string[] = [];
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(rel, keep));
    else if (keep(rel)) out.push(rel);
  }
  return out;
}

const isSrc = (p: string): boolean => p.endsWith(".ts") && !p.endsWith(".d.ts");
const isTest = (p: string): boolean => p.endsWith(".test.ts");

/** wc -l semantics: count newline characters. */
function countLines(content: string): number {
  return (content.match(/\n/g) ?? []).length;
}

// Weak-typing / unfinished-work markers. Each occurrence counts once.
const RISK_RE =
  /\bas\s+any\b|:\s*any\b|<any>|@ts-ignore|@ts-expect-error|\bTODO\b|\bFIXME\b|\bXXX\b/g;

function countRisk(content: string): number {
  return (content.match(RISK_RE) ?? []).length;
}

export function gatherSrcFiles(): SrcFile[] {
  return walk("src", isSrc).map((p) => {
    const content = readFileSync(path.join(ROOT, p), "utf8");
    return { path: p, loc: countLines(content), risk: countRisk(content) };
  });
}

export function gatherTestFiles(): TestFile[] {
  return walk("tests", isTest).map((p) => {
    const content = readFileSync(path.join(ROOT, p), "utf8");
    return { path: p, loc: countLines(content) };
  });
}

/**
 * Resolve a relative import specifier from `fromFile` (repo-relative) to a candidate
 * repo-relative .ts path. Purely lexical — no stat — which is enough for module-level
 * bucketing: `../select.js` from src/language/constructs/ → src/language/select.ts.
 */
function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // external package — not part of the internal graph
  let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  if (target.endsWith(".js")) target = target.slice(0, -3) + ".ts";
  else if (!target.endsWith(".ts")) target = target + ".ts";
  return target.startsWith("src/") ? target : null;
}

// A static/dynamic import or re-export found in a file: its raw specifier and whether the
// statement is TYPE-ONLY (`import type …` / `export type …`). TypeScript ERASES type-only
// imports, so they create no runtime dependency — the module graph counts runtime edges only.
// That is what makes a reported "cycle" mean a real runtime cycle (an init-order hazard)
// rather than the harmless type-level back-references that pervade an adapt-the-engine design
// (e.g. `language` referencing the engine's AST types while the engine reads `language`'s
// `Program` — bidirectional in the type graph, a clean DAG at runtime).
export interface ImportRef {
  spec: string;
  typeOnly: boolean;
}

// `import … from "x"` / `export … from "x"`: the clause between the keyword and `from` decides
// value-vs-type. Anchored at a statement boundary; the clause class excludes quotes so it can't
// run into a string literal, and matches newlines so multi-line clauses are fine.
const FROM_RE = /(?:^|[\n;])\s*(?:import|export)\b([^;'"]*?)\bfrom\s*["']([^"']+)["']/g;
// Side-effect import (`import "x";`) and dynamic `import("x")` — always runtime.
const SIDE_EFFECT_RE = /(?:^|[\n;])\s*import\s*["']([^"']+)["']/g;
const DYNAMIC_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Extract every import/re-export specifier from a source file, flagging type-only statements.
 * Pure (string → refs) so the value-vs-type classification — the one piece of real logic here —
 * is unit-testable without the filesystem.
 *
 * Granularity: only STATEMENT-LEVEL `import type` / `export type` counts as type-only. A mixed
 * `import { type T, value }` is (correctly) a runtime edge; a hypothetical all-`{ type T }` inline
 * list would be conservatively counted as runtime too (none exist in this codebase) — which can
 * only ever KEEP a phantom edge, never hide a real runtime one.
 */
export function parseImports(content: string): ImportRef[] {
  const refs: ImportRef[] = [];
  let m: RegExpExecArray | null;
  FROM_RE.lastIndex = 0;
  while ((m = FROM_RE.exec(content)) !== null) {
    refs.push({ spec: m[2]!, typeOnly: /^type\b/.test(m[1]!.trim()) });
  }
  for (const re of [SIDE_EFFECT_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) refs.push({ spec: m[1]!, typeOnly: false });
  }
  return refs;
}

/** Runtime dependency edges — type-only imports are dropped (erased at compile time). */
export function gatherEdges(srcFiles: SrcFile[]): FileEdge[] {
  const edges: FileEdge[] = [];
  for (const f of srcFiles) {
    const content = readFileSync(path.join(ROOT, f.path), "utf8");
    for (const ref of parseImports(content)) {
      if (ref.typeOnly) continue; // erased at compile time — not a runtime dependency
      const to = resolveImport(f.path, ref.spec);
      if (to) edges.push({ from: f.path, to });
    }
  }
  return edges;
}

/** Per-file commit count + churn (lines added+deleted) across all of git history for src/. */
export function gatherChurn(): FileChurn[] {
  let log: string;
  try {
    log = execFileSync("git", ["log", "--numstat", "--format=%H", "--", "src"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  const commits = new Map<string, Set<string>>();
  const churn = new Map<string, number>();
  const hashRe = /^[0-9a-f]{40}$/;
  let current = "";
  for (const line of log.split("\n")) {
    if (hashRe.test(line)) {
      current = line;
      continue;
    }
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!m) continue;
    let file = m[3]!;
    if (file.includes(" => ")) {
      // rename: "a => b" or "dir/{a => b}/x" — take the resulting path, best-effort.
      file = file.replace(/\{[^}]*=> ([^}]*)\}/g, "$1").replace(/^.* => /, "");
    }
    if (!isSrc(file)) continue;
    const add = m[1] === "-" ? 0 : Number(m[1]);
    const del = m[2] === "-" ? 0 : Number(m[2]);
    churn.set(file, (churn.get(file) ?? 0) + add + del);
    if (!commits.has(file)) commits.set(file, new Set());
    commits.get(file)!.add(current);
  }
  return [...churn.keys()].map((file) => ({
    path: file,
    commits: commits.get(file)?.size ?? 0,
    churn: churn.get(file) ?? 0,
  }));
}

/** Read jest's coverage-final.json if present; null when coverage hasn't been generated. */
export function gatherCoverage(): FileCoverage[] | null {
  const file = path.join(ROOT, "coverage", "coverage-final.json");
  if (!existsSync(file)) return null;
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<
    string,
    { s: Record<string, number> }
  >;
  const out: FileCoverage[] = [];
  for (const [abs, data] of Object.entries(json)) {
    const norm = abs.split(path.sep).join("/");
    const i = norm.indexOf("/src/");
    if (i === -1) continue;
    const rel = norm.slice(i + 1); // drop leading slash → "src/..."
    const counts = Object.values(data.s ?? {});
    out.push({
      path: rel,
      covered: counts.filter((c) => c > 0).length,
      total: counts.length,
    });
  }
  return out;
}
