// Entrypoint: gather raw data (shell) → compute metrics (pure) → format (pure) → write
// a versioned HTML report and print a short summary. Run with `npm run analyze`.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { MODULES } from "./manifest.js";
import { computeMetrics, hotspotRank } from "./metrics.js";
import { formatHtml } from "./format-html.js";
import { reportSlug } from "./provenance.js";
import {
  gatherSrcFiles,
  gatherTestFiles,
  gatherEdges,
  gatherChurn,
  gatherCoverage,
  gatherGitInfo,
} from "./gather.js";

// The report inlines the shared house stylesheet (design/report.css) so it stays a single
// self-contained, committable file — a frozen snapshot, not a live link that re-themes when
// report.css later changes. Read at generate-time so there's one source of truth, not a copy.
function readHouseCss(): string {
  try {
    return readFileSync(path.join(process.cwd(), "design", "report.css"), "utf8");
  } catch {
    return ""; // no stylesheet available (e.g. run outside the repo) — degrade, still self-contained
  }
}

function main(): void {
  const srcFiles = gatherSrcFiles();
  const testFiles = gatherTestFiles();
  const edges = gatherEdges(srcFiles);
  const churn = gatherChurn();
  const coverage = gatherCoverage();
  const git = gatherGitInfo();

  const result = computeMetrics({ modules: MODULES, srcFiles, testFiles, edges, churn, coverage });
  const hotspots = hotspotRank(result.modules);

  const generatedAt = new Date().toISOString().slice(0, 10);
  const html = formatHtml(result, hotspots, {
    generatedAt,
    hasCoverage: coverage != null,
    git,
    reportCss: readHouseCss(),
  });

  // Versioned, committable output: outputs/<date>-<shortsha>.html. Reports are committed on
  // demand, so each run is its own file rather than clobbering a single REPORT.html.
  const outDir = path.join(process.cwd(), "repo_workspace", "analysis", "outputs");
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${reportSlug(generatedAt, git)}.html`);
  writeFileSync(out, html);

  // Short stdout summary so the terminal is useful on its own.
  const totalSrc = result.modules.reduce((s, m) => s + m.srcLoc, 0);
  const totalTest = result.modules.reduce((s, m) => s + m.testLoc, 0);
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
  console.log(`Modules: ${result.modules.length}  src LOC: ${totalSrc}  test LOC: ${totalTest}`);
  if (result.cycles.length) {
    console.log(`Cycles: ${result.cycles.map((c) => c.join("↔")).join(", ")}`);
  }
  console.log("Top hotspots:");
  for (const h of hotspots.slice(0, 5)) {
    const why = h.reasons.length ? ` (${h.reasons.join(", ")})` : "";
    console.log(`  ${h.score.toFixed(1).padStart(5)}  ${h.name}${why}`);
  }
}

main();
