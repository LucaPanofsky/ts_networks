// Pure presentation: render the computed metrics as a single self-contained HTML file in the
// ts-networks house style (ink-on-paper editorial, the rabbit mark — see design/report.css and
// the html-report skill). No I/O: the shared stylesheet is read by the shell (report.ts) and
// passed in as `reportCss`, which we INLINE so the report stays one portable, committable file.
//
// House discipline: the shared report.css is a contract — we do NOT add analysis-specific
// styles to it. Everything this report needs that report.css lacks (the metric tables, the
// hotspot score-bars, coverage tints, reason pills, kind tags) lives in ANALYSIS_STYLE below,
// scoped under the `.r-analysis` body class so it can never leak into other reports.

import type { MetricsResult, ModuleMetrics, Hotspot } from "./metrics.js";
import { provenanceBadges, type GitInfo, type Badge } from "./provenance.js";

const KIND_ORDER = { core: 0, runtime: 1, tooling: 2, stale: 3 } as const;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v: number): string => v.toLocaleString("en-US");

/** Coverage → a theme-consistent tint class (green high, amber mid, red low). */
function covClass(v: number | null): string {
  if (v == null) return "cov-na";
  if (v >= 0.9) return "cov-hi";
  if (v >= 0.7) return "cov-mid";
  return "cov-lo";
}
const covText = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);

function reasonPills(reasons: string[]): string {
  if (!reasons.length) return '<span class="muted">—</span>';
  return reasons
    .map((r) => {
      const cls = r.includes("algebra") ? "rpill rpill-warn" : "rpill";
      return `<span class="${cls}">${esc(r)}</span>`;
    })
    .join(" ");
}

// ---- sections (each returns the inner body of a <section>, which renderSection wraps) ----

function statCards(result: MetricsResult): string {
  const totalSrc = result.modules.reduce((s, m) => s + m.srcLoc, 0);
  const totalTest = result.modules.reduce((s, m) => s + m.testLoc, 0);
  return `<div class="stat-cards">
    <div class="stat"><div class="k">modules</div><div class="v">${result.modules.length}</div></div>
    <div class="stat"><div class="k">src LOC</div><div class="v">${num(totalSrc)}</div></div>
    <div class="stat"><div class="k">test LOC</div><div class="v">${num(totalTest)}</div></div>
    <div class="stat ${result.cycles.length ? "alert" : ""}"><div class="k">cycles</div><div class="v">${result.cycles.length}</div></div>
  </div>`;
}

function hotspotSection(hotspots: Hotspot[]): string {
  const maxScore = Math.max(1, ...hotspots.map((h) => h.score));
  const rows = hotspots
    .map((h, i) => {
      const w = Math.round((h.score / maxScore) * 100);
      return `<tr>
        <td class="n rank">${i + 1}</td>
        <td class="name">${esc(h.name)}</td>
        <td>
          <div class="score"><span class="score-n">${h.score.toFixed(1)}</span><span class="bar"><span class="bar-fill" style="width:${w}%"></span></span></div>
        </td>
        <td class="n">${num(h.srcLoc)}</td>
        <td class="n">${num(h.churn)}</td>
        <td class="n ${covClass(h.coverage)}">${covText(h.coverage)}</td>
        <td class="n">${h.fanIn}</td>
        <td class="why">${reasonPills(h.reasons)}</td>
      </tr>`;
    })
    .join("\n");
  return `<div class="tablewrap"><table class="grid">
    <thead><tr>
      <th class="n">#</th><th>module</th><th>score</th><th class="n">src LOC</th>
      <th class="n">churn</th><th class="n">cov</th><th class="n">fanIn</th><th>why</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function moduleSection(modules: ModuleMetrics[]): string {
  const rows = [...modules]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.srcLoc - a.srcLoc)
    .map((m) => {
      const flag = m.offLimits ? ' <span class="warn-flag" title="algebra — off-limits">⚠</span>' : "";
      return `<tr class="kind-${m.kind}">
        <td class="name">${esc(m.name)}${flag}</td>
        <td><span class="ktag ktag-${m.kind}">${m.kind}</span></td>
        <td class="n">${m.files}</td>
        <td class="n">${num(m.srcLoc)}</td>
        <td class="n">${num(m.testLoc)}</td>
        <td class="n">${m.ratio.toFixed(2)}</td>
        <td class="n ${covClass(m.coverage)}">${covText(m.coverage)}</td>
        <td class="n">${m.fanIn}</td>
        <td class="n">${m.fanOut}</td>
        <td class="n">${m.instability.toFixed(2)}</td>
        <td class="n">${m.commits}</td>
        <td class="n">${num(m.churn)}</td>
        <td class="n">${m.risk}</td>
      </tr>`;
    })
    .join("\n");
  return `<div class="tablewrap"><table class="grid">
    <thead><tr>
      <th>module</th><th>kind</th><th class="n">files</th><th class="n">src LOC</th>
      <th class="n">test LOC</th><th class="n">test:src</th><th class="n">cov</th>
      <th class="n">fanIn</th><th class="n">fanOut</th><th class="n">instab</th>
      <th class="n">commits</th><th class="n">churn</th><th class="n">risk</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function cyclesSection(cycles: string[][]): string {
  if (!cycles.length) {
    return `<p class="ok">None at the module level. ✓</p>`;
  }
  const items = cycles
    .map((c) => `<li><code>${c.map(esc).join(" ↔ ")}</code></li>`)
    .join("");
  return `<p>Module-level import cycles (mutually-dependent modules):</p>
    <ul class="cycles">${items}</ul>`;
}

function unassignedSection(u: { src: string[]; test: string[] }): string {
  const items = [
    ...u.src.map((p) => `<li><span class="tag">src</span> <code>${esc(p)}</code></li>`),
    ...u.test.map((p) => `<li><span class="tag">test</span> <code>${esc(p)}</code></li>`),
  ].join("");
  return `<p>Matched no module in the manifest — extend <code>repo_workspace/analysis/manifest.ts</code> if these should be tracked:</p>
    <ul class="cycles">${items}</ul>`;
}

function legendSection(): string {
  const metric = (term: string, desc: string): string =>
    `<dt>${esc(term)}</dt><dd>${desc}</dd>`;
  return `<div class="legend">
    <dl>
      ${metric("score", "Hotspot rank 0–100 — <b>where to look first</b>. A weighted blend of churn, under-testedness, and blast-radius (fan-in), with size as a minor amplifier. Each input is normalized across the live modules, so the score is <i>relative to this codebase</i>, not absolute. Stale modules are excluded.")}
      ${metric("src LOC", "Lines of source in the module's <code>.ts</code> files (newline count, à la <code>wc -l</code>). Generated files (<code>parser.js</code>, <code>*.d.ts</code>) are excluded.")}
      ${metric("test LOC", "Lines in the mirrored <code>tests/</code> files for the module (plus any explicitly-attached cross-cutting test files).")}
      ${metric("test:src", "test LOC ÷ src LOC — a rough test-investment proxy. Low can mean under-tested; high doesn't guarantee good tests (use <code>cov</code> for that).")}
      ${metric("cov", "Statement coverage from jest, <b>statement-weighted</b> across the module's files (not an average of per-file percentages). <span class=\"cov-hi\">≥90%</span> / <span class=\"cov-mid\">≥70%</span> / <span class=\"cov-lo\">&lt;70%</span>; <span class=\"muted\">—</span> = not measured (run <code>npm run analyze</code>).")}
      ${metric("fanIn", "How many <i>other</i> modules import this one — its <b>blast-radius</b>. High fanIn = a change here ripples widely.")}
      ${metric("fanOut", "How many other modules this one imports — its outward coupling.")}
      ${metric("instab", "Instability = fanOut ÷ (fanIn + fanOut), 0–1 (Martin's metric). <b>0</b> = stable (only depended-on); <b>1</b> = unstable (only depends on others). A stable module is costly to change; an unstable one is freer to.")}
      ${metric("commits", "Number of git commits in history that touched any file in the module.")}
      ${metric("churn", "Total lines added + deleted across all those commits — how much the module has <i>moved</i> over time.")}
      ${metric("risk", "Count of weak-typing / unfinished markers: <code>as any</code>, <code>: any</code>, <code>@ts-ignore</code>, <code>@ts-expect-error</code>, <code>TODO</code>, <code>FIXME</code>, <code>XXX</code>.")}
      ${metric("kind", "<span class=\"ktag ktag-core\">core</span> algebra + central wiring · <span class=\"ktag ktag-runtime\">runtime</span> DSL frontend, engine, sandbox, operations · <span class=\"ktag ktag-tooling\">tooling</span> entrypoints/adapters · <span class=\"ktag ktag-stale\">stale</span> abandoned (excluded from the ranking).")}
      ${metric("⚠", "Algebra surface (merge / I / naryUnpacking and friends) — given-and-correct; <b>change only with explicit permission</b>. Ranked but flagged, never a refactor target.")}
    </dl>
  </div>`;
}

// ---- document shell ----

function badgeHtml(b: Badge): string {
  const cls = b.kind === "ink" ? "badge accepted" : b.kind === "red" ? "badge red" : "badge";
  return `<span class="${cls}">${esc(b.label)}</span>`;
}

function renderSection(num: string, id: string, title: string, lead: string, body: string): string {
  return `<section id="${id}"><div class="wrap">
    <div class="sec-head"><span class="num">${num}</span><h2>${title}</h2></div>
    ${lead ? `<p>${lead}</p>` : ""}
    ${body}
  </div></section>`;
}

export interface ReportMeta {
  generatedAt: string;
  hasCoverage: boolean;
  git: GitInfo;
  /** The shared house stylesheet (design/report.css), inlined for a self-contained file. */
  reportCss: string;
}

export function formatHtml(
  result: MetricsResult,
  hotspots: Hotspot[],
  meta: ReportMeta,
): string {
  const badges = provenanceBadges(meta.generatedAt, meta.git).map(badgeHtml).join("\n      ");

  const coverageNote = meta.hasCoverage
    ? ""
    : `<div class="principle" style="border-left-color:var(--ink)">
        <h3>Coverage not measured</h3>
        <p>The <code>cov</code> column is empty — run <code>npm run analyze</code> to populate it; the
          ranking then uses real statement coverage instead of the test:src ratio.</p>
      </div>`;

  const hasUnassigned = result.unassigned.src.length > 0 || result.unassigned.test.length > 0;

  // Number the sections sequentially; "Unassigned" only appears when there is something to show.
  const sections: { id: string; label: string; title: string; lead: string; body: string }[] = [
    {
      id: "hotspots", label: "Hotspots", title: "Hotspots",
      lead: "Where to look first — modules ranked by churn × under-testedness × blast-radius (fan-in), with size a minor amplifier. Stale modules are excluded.",
      body: coverageNote + statCards(result) + hotspotSection(hotspots),
    },
    {
      id: "modules", label: "Modules", title: "All modules",
      lead: "Every module in the manifest, grouped by kind, then by size.",
      body: moduleSection(result.modules),
    },
    {
      id: "cycles", label: "Cycles", title: "Dependency cycles", lead: "",
      body: cyclesSection(result.cycles),
    },
    ...(hasUnassigned
      ? [{ id: "unassigned", label: "Unassigned", title: "Unassigned files", lead: "", body: unassignedSection(result.unassigned) }]
      : []),
    {
      id: "legend", label: "Legend", title: "Legend",
      lead: "What each column means.",
      body: legendSection(),
    },
  ];

  const pad = (i: number): string => String(i + 1).padStart(2, "0");
  const toc = sections
    .map((s, i) => `<a href="#${s.id}"><span class="n">${pad(i)}</span>${esc(s.label)}</a>`)
    .join("\n    ");
  const body = sections.map((s, i) => renderSection(pad(i), s.id, s.title, s.lead, s.body)).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Codebase maintenance report · ts-networks</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<style>${meta.reportCss}</style>
<style>${ANALYSIS_STYLE}</style>
</head>
<body class="r-analysis">
${RABBIT_SYMBOL}
<header>
  <div class="wrap">
    <p class="eyebrow">Maintenance · codebase analysis</p>
    <div class="titleline">
      <svg><use href="#rabbit"/></svg>
      <h1>Codebase maintenance<span class="q">?</span></h1>
    </div>
    <p class="lede">Where in <code>src/</code> to look first — the module taxonomy ranked by churn,
      under-testedness and blast-radius, stamped with the commit it was generated from.</p>
    <div class="badges">
      ${badges}
    </div>
  </div>
</header>
<nav class="toc">
  <div class="wrap">
    ${toc}
  </div>
</nav>
${body}
<footer>
  <div class="wrap">
    <p><strong>Codebase maintenance report</strong> — module = a first-level <code>src/</code> subdirectory
      (loose root files are one-file modules). Generated by <code>npm run analyze</code>
      (<code>repo_workspace/analysis/report.ts</code>). <span class="warn-flag">⚠</span> = algebra surface,
      off-limits without explicit permission.</p>
  </div>
</footer>
</body>
</html>
`;
}

// ===== inlined assets (self-contained: no external requests) =====

// The rabbit-on-paper favicon as a data URI, and the reusable <symbol> for the header mark.
// Canonical source: repo_workspace/resources/logo.html (kept in sync with design/template.html).
const FAVICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgNDAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgcng9Ijc2IiBmaWxsPSIjZjNlZmU2Ii8+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDAsNDApIHNjYWxlKDAuOCkiPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsNDAwKSBzY2FsZSgwLjEsLTAuMSkiPjxwYXRoIGZpbGw9IiMxMTExMTEiIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTM0MDIgMzg3MyBjLTgwIC0zOSAtMTk1IC0xNzkgLTI3MSAtMzMwIC0yMyAtNDYgLTQ1IC04MyAtNDkgLTgzIC00CjAgLTMyIDI4IC02MiA2MyAtMTIyIDEzOSAtMzAwIDI2OSAtNDUxIDMyNyAtOTcgMzcgLTEyMyAzOCAtMTU4IDMgLTc5IC03OQotMTA1IC00MjIgLTQ4IC02NDUgNDQgLTE3OSAxMjAgLTM1NyAyMTMgLTUwMCA0MyAtNjcgNzQgLTEyMiA3NCAtMTMyIDAgLTMKLTMwIC0zOSAtNjcgLTc4IC0zNiAtNDAgLTkwIC0xMTAgLTEyMCAtMTU1IC02MSAtOTUgLTYzIC05NiAtMTc4IC02MyAtNDk4CjE0MyAtMTA3MiAyMCAtMTQxMCAtMzAxIC0yMDQgLTE5NCAtMzIyIC00MjMgLTM4MCAtNzM0IC0yNCAtMTI5IC00MCAtMTY5IC03NAotMTgwIC02NiAtMjEgLTExMyAtMTgwIC05MyAtMzE1IDIwIC0xMzkgNjggLTIxMiAxNzUgLTI2NiA2NCAtMzMgNjMgLTMxIDcwCi0xMDkgMTQgLTE1MyA4OSAtMjIwIDI4NyAtMjU2IDE4MCAtMzMgMTQyNiAtMTEgMTUxOCAyNyA2MiAyNSA2OSAxMjUgMTQgMjE0Ci0zMCA0OSAtMzEgNTAgLTExIDYxIDExIDUgMzIgOSA0NyA3IDI4IC0zIDMyIC05IDc3IC0xMTAgNzIgLTE2MCAyMzUgLTIzMwo0NzIgLTIxMSA3MSA3IDEyMyAxNyAxNDUgMjkgMjcgMTQgNTkgMTggMTczIDE5IDI2MiAzIDMyOSA0MyAzMDkgMTgzIC0xOSAxMzMKLTg2IDIwNyAtMjMxIDI1MyAtMzcgMTIgLTY5IDIzIC03MSAyNCAtMiAxIDEzIDQxIDMyIDg3IDQ3IDExMiA3MCAyMDIgMTAxCjM4MiAxNCA4MiAzOSAyMDggNTUgMjgwIDE2IDcyIDM0IDE3MSA0MSAyMTkgMTQgMTA0IDEzIDEwMyAxMzQgMTEwIDEyMCA2IDE5NgozNSAyNTUgOTYgNzMgNzQgODQgMTM4IDUxIDI5NiAtNDUgMjIxIC0xNDUgMzc4IC0zMzEgNTI3IGwtNDUgMzUgMTMgNDQgYzYwCjIxMiA3NyAzNTYgNjIgNTM5IC0xNiAxOTMgLTM4IDMwMyAtOTcgNDg4IC01MiAxNjIgLTg5IDE5NiAtMTcxIDE1NXogbS04MDgKLTEzOSBjMzc2IC0xOTQgNjE2IC01NjkgNjE2IC05NjIgMCAtOTYgLTEgLTk1IDEyMCAtMTI4IDMyOCAtODcgNTYwIC0zNzIgNTYwCi02ODUgMCAtMTI3IC0xMTMgLTE4MyAtMzUwIC0xNzYgLTEwNyAzIC0xNTUgLTE4IC0xMjAgLTUzIDI1IC0yNSAyNiAtODYgNQotMjIwIC03MiAtNDQ2IC0yNTYgLTc2OSAtNTA4IC04OTEgLTQ1IC0yMSAtODggLTM5IC05NyAtMzkgLTI4IDAgLTU5IC0yOCAtNTMKLTQ5IDggLTMzIDM2IC00OSAxMjEgLTc0IDEzNSAtMzkgMjAyIC0xMDIgMjAyIC0xOTAgMCAtNTEgLTE1IC01NyAtMTQ3IC02NAotMjEyIC0xMSAtMjg2IDI4IC0zNjggMTkyIC00MSA4MiAtNTYgMTAzIC04NyAxMjAgbC0zNyAyMCAtMTE2IC0yNCBjLTEyMSAtMjUKLTI3NCAtMjYgLTI5OCAtMiAtNyA3IC0zIDQwIDE0IDExMyAzNSAxNTAgMzMgMzMwIC00IDQ0MyAtMTI3IDM4MyAtNTE4IDU4MQotOTYyIDQ4NSAtMTAzIC0yMiAtMTAzIC00NSAwIC0yOSA0MDAgNjMgNzkzIC0xNTUgODgwIC00ODYgMzggLTE0NyAxMyAtMzEwCi03NSAtNDg1IC01OCAtMTE2IC02OCAtMTA2IDEwMCAtMTEzIDE3OCAtOCAzMTMgLTczIDMzNSAtMTYwIDExIC00MSAtMiAtNDgKLTExMiAtNTggLTE2NCAtMTYgLTEyNTAgLTIzIC0xMzMwIC05IC0yMDMgMzUgLTI3OCAxNjEgLTE3MyAyOTIgbDMxIDM4IC01NCAwCmMtMTczIDAgLTI3MCAxMDEgLTI2OCAyODEgMSAxMDIgMjQgMTQ5IDkyIDE4NSA0OCAyNiA1NCAzMyA1NyA2NCA0NCA1ODAgMzc5Cjk4OSA5MjcgMTEzMCAyODggNzQgNTIzIDYxIDg5MSAtNTEgNTAgLTE1IDcwIC04IDkyIDMyIDgzIDE1MSAxOTYgMjg3IDI3OQozMzYgbDQyIDI0IC05MCAxMzYgYy0yNDQgMzczIC0zMzcgNzMxIC0yNjMgMTAxNiAyNSA5NyAzNSAxMDAgMTQ4IDQxeiBtODc0Ci0xIGMyOSAtNzAgNzkgLTI3MiA5NiAtMzk0IDI5IC0xOTggMTYgLTQyNyAtMzIgLTU2OSAtMjYgLTc1IC0zNSAtNzkgLTEyNwotNTAgLTEwMCAzMSAtOTYgMjYgLTExMCAxNTUgLTExIDEwNyAtNTggMjgwIC0xMDMgMzc5IGwtNDAgOTAgMjQgNjUgYzQ5IDEzMQoxNTEgMjg2IDIyNyAzNDYgNDIgMzMgNDEgMzMgNjUgLTIyeiBtLTI0OCAtMzA0NiBjLTU1IC0xMjEgLTQ2IC0xMzcgMTA1IC0xODIKMTM0IC00MCAyMDMgLTEyMCAxODEgLTIwOSAtNyAtMjkgLTI3IC0zNCAtMTYxIC00MiAtMTM1IC03IC0xNDUgLTIgLTE4MSAxMDAKLTIxIDYwIC03MiAxMTkgLTEzNiAxNTUgbC00OCAyOCA2OCA0NiBjMzcgMjUgOTYgNzUgMTMyIDExMSAzNiAzNSA2NiA2MyA2OAo2MiAxIC0yIC0xMSAtMzMgLTI4IC02OXoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCw0MDApIHNjYWxlKDAuMSwtMC4xKSI+PHBhdGggZmlsbD0iI2UzMDYxMyIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMjk3NSAyNDY2IGMtMTg5IC0zNiAtNDA1IC0xODkgLTQzMCAtMzAzIC0xNSAtNzEgNjUgLTE2NyAxMjIgLTE0NwozNCAxMyA4NCA2OSAxMzQgMTUwIDg5IDE0OCAxNjggMTk4IDMwOSAxOTggMzIxIC0xIDQ0MCAtMzEzIDE3NyAtNDYzIC0yOSAtMTYKLTExNyAtNTIgLTE5NyAtODEgLTIxMiAtNzYgLTI4NCAtMTE3IC0zMjkgLTE5MCAtMjkgLTQ4IC0zMCAtMTkwIC0xIC0yODEgMzUKLTExNCAxMzIgLTIzOSAxODUgLTIzOSA3NiAwIDg5IDM1IDkxIDI0MyAxIDE2NSAyIDE2OCAzMiAyMzAgNjUgMTMwIDIyMyAyNTAKMzk0IDI5NyA4OSAyNCAyNDYgMTAwIDI5MyAxNDIgNzMgNjQgNjYgMTQyIC0yMCAyMTMgLTIwMCAxNjQgLTU1MiAyNzEgLTc2MAoyMzF6IE0yOTIwIDk5MSBjLTEzNyAtNDQgLTE2MyAtMTgwIC01MSAtMjcxIDQ4IC00MCA4NSAtMzkgMTI1IDMgODEgODcKMTEyIDIyNyA1NiAyNTQgLTM2IDE3IC0xMDAgMjQgLTEzMCAxNHoiLz48L2c+PC9nPjwvc3ZnPg==";

const RABBIT_SYMBOL = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="rabbit" viewBox="0 0 400 400"><g transform="translate(0.000000,400.000000) scale(0.100000,-0.100000)">
    <path fill="currentColor" fill-rule="evenodd" d="M3402 3873 c-80 -39 -195 -179 -271 -330 -23 -46 -45 -83 -49 -83 -4
0 -32 28 -62 63 -122 139 -300 269 -451 327 -97 37 -123 38 -158 3 -79 -79
-105 -422 -48 -645 44 -179 120 -357 213 -500 43 -67 74 -122 74 -132 0 -3
-30 -39 -67 -78 -36 -40 -90 -110 -120 -155 -61 -95 -63 -96 -178 -63 -498
143 -1072 20 -1410 -301 -204 -194 -322 -423 -380 -734 -24 -129 -40 -169 -74
-180 -66 -21 -113 -180 -93 -315 20 -139 68 -212 175 -266 64 -33 63 -31 70
-109 14 -153 89 -220 287 -256 180 -33 1426 -11 1518 27 62 25 69 125 14 214
-30 49 -31 50 -11 61 11 5 32 9 47 7 28 -3 32 -9 77 -110 72 -160 235 -233
472 -211 71 7 123 17 145 29 27 14 59 18 173 19 262 3 329 43 309 183 -19 133
-86 207 -231 253 -37 12 -69 23 -71 24 -2 1 13 41 32 87 47 112 70 202 101
382 14 82 39 208 55 280 16 72 34 171 41 219 14 104 13 103 134 110 120 6 196
35 255 96 73 74 84 138 51 296 -45 221 -145 378 -331 527 l-45 35 13 44 c60
212 77 356 62 539 -16 193 -38 303 -97 488 -52 162 -89 196 -171 155z m-808
-139 c376 -194 616 -569 616 -962 0 -96 -1 -95 120 -128 328 -87 560 -372 560
-685 0 -127 -113 -183 -350 -176 -107 3 -155 -18 -120 -53 25 -25 26 -86 5
-220 -72 -446 -256 -769 -508 -891 -45 -21 -88 -39 -97 -39 -28 0 -59 -28 -53
-49 8 -33 36 -49 121 -74 135 -39 202 -102 202 -190 0 -51 -15 -57 -147 -64
-212 -11 -286 28 -368 192 -41 82 -56 103 -87 120 l-37 20 -116 -24 c-121 -25
-274 -26 -298 -2 -7 7 -3 40 14 113 35 150 33 330 -4 443 -127 383 -518 581
-962 485 -103 -22 -103 -45 0 -29 400 63 793 -155 880 -486 38 -147 13 -310
-75 -485 -58 -116 -68 -106 100 -113 178 -8 313 -73 335 -160 11 -41 -2 -48
-112 -58 -164 -16 -1250 -23 -1330 -9 -203 35 -278 161 -173 292 l31 38 -54 0
c-173 0 -270 101 -268 281 1 102 24 149 92 185 48 26 54 33 57 64 44 580 379
989 927 1130 288 74 523 61 891 -51 50 -15 70 -8 92 32 83 151 196 287 279
336 l42 24 -90 136 c-244 373 -337 731 -263 1016 25 97 35 100 148 41z m874
-1 c29 -70 79 -272 96 -394 29 -198 16 -427 -32 -569 -26 -75 -35 -79 -127
-50 -100 31 -96 26 -110 155 -11 107 -58 280 -103 379 l-40 90 24 65 c49 131
151 286 227 346 42 33 41 33 65 -22z m-248 -3046 c-55 -121 -46 -137 105 -182
134 -40 203 -120 181 -209 -7 -29 -27 -34 -161 -42 -135 -7 -145 -2 -181 100
-21 60 -72 119 -136 155 l-48 28 68 46 c37 25 96 75 132 111 36 35 66 63 68
62 1 -2 -11 -33 -28 -69z"/>
  </g>
  <g transform="translate(0.000000,400.000000) scale(0.100000,-0.100000)">
    <path fill="#e30613" fill-rule="evenodd" d="M2975 2466 c-189 -36 -405 -189 -430 -303 -15 -71 65 -167 122 -147
34 13 84 69 134 150 89 148 168 198 309 198 321 -1 440 -313 177 -463 -29 -16
-117 -52 -197 -81 -212 -76 -284 -117 -329 -190 -29 -48 -30 -190 -1 -281 35
-114 132 -239 185 -239 76 0 89 35 91 243 1 165 2 168 32 230 65 130 223 250
394 297 89 24 246 100 293 142 73 64 66 142 -20 213 -200 164 -552 271 -760
231z M2920 991 c-137 -44 -163 -180 -51 -271 48 -40 85 -39 125 3 81 87
112 227 56 254 -36 17 -100 24 -130 14z"/>
  </g></symbol>
</svg>`;

// Analysis-specific styles — scoped under .r-analysis so they never touch other reports that
// share report.css. Tokens (--ink/--paper/--red/--muted/--line/--good) come from report.css;
// the one local hex is the amber mid-coverage tint, which the house palette doesn't carry.
const ANALYSIS_STYLE = `
.r-analysis section{padding:48px 0}
.r-analysis .lede code{background:#fff}
.r-analysis .stat-cards{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 22px}
.r-analysis .stat{background:#fff;border:1.5px solid var(--ink);padding:14px 20px;min-width:128px}
.r-analysis .stat .k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:800}
.r-analysis .stat .v{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;margin-top:4px}
.r-analysis .stat.alert .v{color:var(--red)}
.r-analysis .tablewrap{overflow-x:auto;border:1.5px solid var(--ink);background:#fff;margin:8px 0}
.r-analysis table.grid{width:100%;border-collapse:collapse;font-size:13px}
.r-analysis .grid th,.r-analysis .grid td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
.r-analysis .grid thead th{background:var(--paper);border-bottom:1.5px solid var(--ink);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:800}
.r-analysis .grid tbody tr:last-child td{border-bottom:none}
.r-analysis .grid tbody tr:hover{background:var(--paper)}
.r-analysis .grid .n{text-align:right;font-variant-numeric:tabular-nums}
.r-analysis .grid .name{font-weight:800}
.r-analysis .grid .rank{color:var(--muted);width:30px}
.r-analysis .grid .why{white-space:normal;min-width:200px}
.r-analysis .score{display:flex;align-items:center;gap:10px;min-width:190px}
.r-analysis .score-n{font-weight:800;font-variant-numeric:tabular-nums;width:42px;text-align:right}
.r-analysis .bar{position:relative;flex:1;background:var(--paper);border:1px solid var(--line);height:15px;min-width:80px}
.r-analysis .bar-fill{position:absolute;inset:0 auto 0 0;background:var(--ink)}
.r-analysis .cov-hi{color:var(--good);font-weight:800}
.r-analysis .cov-mid{color:#9a6a00;font-weight:800}
.r-analysis .cov-lo{color:var(--red);font-weight:800}
.r-analysis .cov-na,.r-analysis .muted{color:var(--muted)}
.r-analysis .rpill{display:inline-block;background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:1px 10px;font-size:11.5px;margin:1px 2px 1px 0;white-space:nowrap;color:var(--muted)}
.r-analysis .rpill-warn{border-color:var(--red);color:var(--red)}
.r-analysis .ktag{display:inline-block;font-size:10.5px;padding:2px 8px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;border:1.5px solid var(--ink)}
.r-analysis .ktag-core{background:var(--red);color:#fff;border-color:var(--red)}
.r-analysis .ktag-runtime{background:var(--ink);color:var(--paper)}
.r-analysis .ktag-tooling{background:#fff;color:var(--ink)}
.r-analysis .ktag-stale{background:var(--paper);color:var(--muted);border-color:var(--line)}
.r-analysis tr.kind-stale td{opacity:.6}
.r-analysis .warn-flag{color:var(--red);font-weight:800}
.r-analysis .cycles{margin:6px 0;padding-left:20px}
.r-analysis .cycles li{margin:4px 0}
.r-analysis .ok{color:var(--good);font-weight:800}
.r-analysis .tag{display:inline-block;background:var(--paper);border:1px solid var(--line);padding:0 7px;font-size:11px;margin-right:6px}
.r-analysis .legend{background:#fff;border:1.5px solid var(--ink);padding:6px 24px}
.r-analysis .legend dl{display:grid;grid-template-columns:max-content 1fr;gap:10px 20px;margin:18px 0;align-items:baseline}
.r-analysis .legend dt{font-family:"SF Mono",ui-monospace,Menlo,monospace;font-weight:700;color:var(--red);white-space:nowrap}
.r-analysis .legend dd{margin:0;color:var(--ink);font-size:13.5px;max-width:none}
@media(max-width:820px){.r-analysis .legend dl{grid-template-columns:1fr;row-gap:2px}}
`;
