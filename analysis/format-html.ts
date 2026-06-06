// Pure presentation: render the computed metrics as a single self-contained HTML file,
// themed with the Claude palette (warm cream ground, clay/coral accent, dark ink). No I/O,
// no external assets — inline CSS so the file opens standalone in any browser.

import type { MetricsResult, ModuleMetrics, Hotspot } from "./metrics.js";

const KIND_ORDER = { core: 0, runtime: 1, tooling: 2, stale: 3 } as const;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v: number): string => v.toLocaleString("en-US");

/** Coverage → a theme-consistent tint class (sage high, clay mid, red-clay low). */
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
      const cls = r.includes("algebra") ? "pill pill-warn" : "pill";
      return `<span class="${cls}">${esc(r)}</span>`;
    })
    .join(" ");
}

function hotspotSection(hotspots: Hotspot[]): string {
  const maxScore = Math.max(1, ...hotspots.map((h) => h.score));
  const rows = hotspots
    .map((h, i) => {
      const w = Math.round((h.score / maxScore) * 100);
      return `<tr>
        <td class="rank">${i + 1}</td>
        <td class="name">${esc(h.name)}</td>
        <td class="score">
          <div class="bar"><div class="bar-fill" style="width:${w}%"></div><span class="bar-val">${h.score.toFixed(
            1,
          )}</span></div>
        </td>
        <td class="n">${num(h.srcLoc)}</td>
        <td class="n">${num(h.churn)}</td>
        <td class="n ${covClass(h.coverage)}">${covText(h.coverage)}</td>
        <td class="n">${h.fanIn}</td>
        <td class="why">${reasonPills(h.reasons)}</td>
      </tr>`;
    })
    .join("\n");
  return `<section>
    <h2>Hotspots <span class="sub">— look here first</span></h2>
    <p class="lead">Ranked by churn × under-tested × blast-radius (fan-in), with size as a minor amplifier. Stale modules excluded.</p>
    <table class="grid">
      <thead><tr>
        <th>#</th><th>module</th><th class="score-h">score</th><th class="n">src LOC</th>
        <th class="n">churn</th><th class="n">cov</th><th class="n">fanIn</th><th>why</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function moduleSection(modules: ModuleMetrics[]): string {
  const rows = [...modules]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.srcLoc - a.srcLoc)
    .map((m) => {
      const flag = m.offLimits ? ' <span class="warn-flag" title="algebra — off-limits">⚠</span>' : "";
      return `<tr class="kind-${m.kind}">
        <td class="name">${esc(m.name)}${flag}</td>
        <td><span class="kind kind-tag-${m.kind}">${m.kind}</span></td>
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
  return `<section>
    <h2>All modules</h2>
    <table class="grid">
      <thead><tr>
        <th>module</th><th>kind</th><th class="n">files</th><th class="n">src LOC</th>
        <th class="n">test LOC</th><th class="n">test:src</th><th class="n">cov</th>
        <th class="n">fanIn</th><th class="n">fanOut</th><th class="n">instab</th>
        <th class="n">commits</th><th class="n">churn</th><th class="n">risk</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function cyclesSection(cycles: string[][]): string {
  if (!cycles.length) {
    return `<section><h2>Dependency cycles</h2><p class="ok">None at the module level. ✓</p></section>`;
  }
  const items = cycles
    .map((c) => `<li><code>${c.map(esc).join(" ↔ ")}</code></li>`)
    .join("");
  return `<section>
    <h2>Dependency cycles</h2>
    <p class="lead">Module-level import cycles (mutually-dependent modules):</p>
    <ul class="cycles">${items}</ul>
  </section>`;
}

function unassignedSection(u: { src: string[]; test: string[] }): string {
  if (!u.src.length && !u.test.length) return "";
  const items = [
    ...u.src.map((p) => `<li><span class="tag">src</span> <code>${esc(p)}</code></li>`),
    ...u.test.map((p) => `<li><span class="tag">test</span> <code>${esc(p)}</code></li>`),
  ].join("");
  return `<section>
    <h2>Unassigned files</h2>
    <p class="lead">Matched no module in the manifest — extend <code>analysis/manifest.ts</code> if these should be tracked:</p>
    <ul class="cycles">${items}</ul>
  </section>`;
}

function legendSection(): string {
  const metric = (term: string, desc: string): string =>
    `<dt>${esc(term)}</dt><dd>${desc}</dd>`;
  return `<section>
    <h2>Legend <span class="sub">— what each column means</span></h2>
    <div class="legend">
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
        ${metric("kind", "<span class=\"kind kind-tag-core\">core</span> algebra + central wiring · <span class=\"kind kind-tag-runtime\">runtime</span> DSL frontend, engine, sandbox, operations · <span class=\"kind kind-tag-tooling\">tooling</span> entrypoints/adapters · <span class=\"kind kind-tag-stale\">stale</span> abandoned (excluded from the ranking).")}
        ${metric("⚠", "Algebra surface (merge / I / naryUnpacking and friends) — given-and-correct; <b>change only with explicit permission</b>. Ranked but flagged, never a refactor target.")}
      </dl>
    </div>
  </section>`;
}

export interface ReportMeta {
  generatedAt: string;
  hasCoverage: boolean;
}

const STYLE = `
:root {
  --bg: #f0eee6; --card: #faf9f5; --ink: #1f1e1d; --muted: #6b6862;
  --accent: #d97757; --accent-deep: #bd5d3a; --border: #e3ddcf;
  --hi: #6a8f5f; --mid: #d99a57; --lo: #c0392b;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1100px; margin: 0 auto; padding: 48px 28px 80px; }
h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 600; font-size: 30px; margin: 0 0 6px; }
h2 { font-family: Georgia, serif; font-weight: 600; font-size: 21px; margin: 40px 0 4px; }
h2 .sub { font-family: ui-sans-serif, sans-serif; font-weight: 400; font-size: 15px; color: var(--muted); }
.meta { color: var(--muted); font-size: 13px; margin-bottom: 28px; }
.lead { color: var(--muted); margin: 4px 0 16px; }
.banner {
  background: #fbeee7; border: 1px solid #ecc7b5; border-left: 3px solid var(--accent);
  padding: 10px 14px; border-radius: 8px; font-size: 13.5px; margin-bottom: 24px;
}
.cards { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 8px; }
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 18px; min-width: 120px;
}
.card .k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.card .v { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.card.alert .v { color: var(--accent-deep); }
table.grid {
  width: 100%; border-collapse: collapse; background: var(--card);
  border: 1px solid var(--border); border-radius: 10px; overflow: hidden; font-size: 13.5px;
}
.grid th, .grid td { padding: 8px 11px; text-align: left; border-bottom: 1px solid var(--border); }
.grid thead th { background: #efe7da; color: #4a463f; font-weight: 600; font-size: 12px;
  text-transform: uppercase; letter-spacing: .03em; }
.grid tbody tr:last-child td { border-bottom: none; }
.grid tbody tr:hover { background: #f3eee3; }
.n { text-align: right; font-variant-numeric: tabular-nums; }
.rank { color: var(--muted); width: 28px; }
.name { font-weight: 600; }
.score { width: 200px; }
.score-h { width: 200px; }
.bar { position: relative; background: #ece5d6; border-radius: 5px; height: 20px; }
.bar-fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, var(--accent), var(--accent-deep));
  border-radius: 5px; }
.bar-val { position: absolute; right: 7px; top: 0; line-height: 20px; font-size: 12px; font-weight: 600;
  color: #1f1e1d; font-variant-numeric: tabular-nums; }
.cov-hi { color: var(--hi); font-weight: 600; }
.cov-mid { color: var(--mid); font-weight: 600; }
.cov-lo { color: var(--lo); font-weight: 700; }
.cov-na { color: var(--muted); }
.muted { color: var(--muted); }
.pill { display: inline-block; background: #ece5d6; color: #5b564d; border-radius: 20px;
  padding: 1px 9px; font-size: 11.5px; margin: 1px 0; white-space: nowrap; }
.pill-warn { background: #fbe3d6; color: var(--accent-deep); }
.kind { font-size: 11px; padding: 1px 8px; border-radius: 5px; text-transform: uppercase; letter-spacing: .03em; }
.kind-tag-core { background: #fbe3d6; color: var(--accent-deep); }
.kind-tag-runtime { background: #e3ecd9; color: #4a7043; }
.kind-tag-tooling { background: #dfe6ee; color: #3f5a78; }
.kind-tag-stale { background: #e9e6df; color: #8a857b; }
tr.kind-stale td { opacity: .58; }
.warn-flag { color: var(--accent-deep); }
.cycles { margin: 6px 0; padding-left: 20px; }
.cycles li { margin: 3px 0; }
code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px;
  background: #ece5d6; padding: 1px 5px; border-radius: 4px; }
.tag { display: inline-block; background: #ece5d6; color: #5b564d; border-radius: 4px;
  padding: 0 6px; font-size: 11px; }
.ok { color: var(--hi); font-weight: 600; }
.legend { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 4px 22px; }
.legend dl { display: grid; grid-template-columns: max-content 1fr; gap: 9px 20px; margin: 16px 0; align-items: baseline; }
.legend dt { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-weight: 600; color: var(--accent-deep); white-space: nowrap; }
.legend dd { margin: 0; color: #4a463f; font-size: 13.5px; }
.legend dd b { color: var(--ink); }
footer { margin-top: 48px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); padding-top: 14px; }
`;

export function formatHtml(
  result: MetricsResult,
  hotspots: Hotspot[],
  meta: ReportMeta,
): string {
  const totalSrc = result.modules.reduce((s, m) => s + m.srcLoc, 0);
  const totalTest = result.modules.reduce((s, m) => s + m.testLoc, 0);

  const cards = `<div class="cards">
    <div class="card"><div class="k">modules</div><div class="v">${result.modules.length}</div></div>
    <div class="card"><div class="k">src LOC</div><div class="v">${num(totalSrc)}</div></div>
    <div class="card"><div class="k">test LOC</div><div class="v">${num(totalTest)}</div></div>
    <div class="card ${result.cycles.length ? "alert" : ""}"><div class="k">cycles</div><div class="v">${result.cycles.length}</div></div>
  </div>`;

  const banner = meta.hasCoverage
    ? ""
    : `<div class="banner">Coverage column is empty — run <code>npm run analyze</code> to populate it (the ranking then uses real coverage instead of the test:src ratio).</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Codebase maintenance report</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <h1>Codebase maintenance report</h1>
  <div class="meta">Generated ${esc(meta.generatedAt)} · module = a first-level <code>src/</code> subdirectory (loose root files are one-file modules) · <span class="warn-flag">⚠</span> = algebra surface, off-limits without explicit permission</div>
  ${banner}
  ${cards}
  ${hotspotSection(hotspots)}
  ${moduleSection(result.modules)}
  ${cyclesSection(result.cycles)}
  ${unassignedSection(result.unassigned)}
  ${legendSection()}
  <footer>ts-networks · generated by <code>npm run analyze</code> (analysis/report.ts)</footer>
</div>
</body>
</html>
`;
}
