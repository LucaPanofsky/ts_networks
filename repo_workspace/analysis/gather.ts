// Imperative shell: read the filesystem + git + (optional) coverage and produce the raw
// per-file numbers the pure core (metrics.ts) rolls up. Nothing here interprets — it only
// gathers. All paths are emitted repo-relative with posix separators.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import * as path from "node:path";
import type { SrcFile, TestFile, FileEdge, FileChurn, FileCoverage } from "./metrics.js";

const ROOT = process.cwd();

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
 * bucketing: `../tools.js` from src/sandbox/jsgen/ → src/sandbox/tools.ts.
 */
function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // external package — not part of the internal graph
  let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  if (target.endsWith(".js")) target = target.slice(0, -3) + ".ts";
  else if (!target.endsWith(".ts")) target = target + ".ts";
  return target.startsWith("src/") ? target : null;
}

const STATIC_IMPORT_RE = /\b(?:from|import)\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

export function gatherEdges(srcFiles: SrcFile[]): FileEdge[] {
  const edges: FileEdge[] = [];
  for (const f of srcFiles) {
    const content = readFileSync(path.join(ROOT, f.path), "utf8");
    for (const re of [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const to = resolveImport(f.path, m[1]!);
        if (to) edges.push({ from: f.path, to });
      }
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
