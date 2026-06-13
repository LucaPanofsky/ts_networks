// Entrypoint: gather raw data (shell) → compute metrics (pure) → format (pure) → write
// analysis/REPORT.md and print a short summary. Run with `npm run analyze`.

import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODULES } from "./manifest.js";
import { computeMetrics, hotspotRank } from "./metrics.js";
import { formatHtml } from "./format-html.js";
import {
  gatherSrcFiles,
  gatherTestFiles,
  gatherEdges,
  gatherChurn,
  gatherCoverage,
} from "./gather.js";

function main(): void {
  const srcFiles = gatherSrcFiles();
  const testFiles = gatherTestFiles();
  const edges = gatherEdges(srcFiles);
  const churn = gatherChurn();
  const coverage = gatherCoverage();

  const result = computeMetrics({ modules: MODULES, srcFiles, testFiles, edges, churn, coverage });
  const hotspots = hotspotRank(result.modules);

  const generatedAt = new Date().toISOString().slice(0, 10);
  const html = formatHtml(result, hotspots, { generatedAt, hasCoverage: coverage != null });

  const out = path.join(process.cwd(), "analysis", "REPORT.html");
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
