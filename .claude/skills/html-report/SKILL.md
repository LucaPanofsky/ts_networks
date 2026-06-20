---
name: html-report
description: Produce a polished, stakeholder-facing HTML report in the ts-networks house style (ink-on-paper editorial, the rabbit mark). Use whenever you need to hand a report to the Stakeholder as a presentational deliverable — ADR, design doc, review, audit, post-mortem, research summary — regardless of the report's content. Reuses the shared stylesheet and component library in design/.
---

# html-report — presenting work back to the Stakeholder

This skill is **presentational**, not topical: it is about *how a report looks and reads*
when handed back, independent of whether it's an ADR, a review, an audit, or a research
note. It exists so every report reuses one house style instead of being reinvented — the
economies of scope come from the shared stylesheet, not from copy-paste.

The reference implementation is `design/deployment-architecture.html`. When in doubt, open
it and copy the pattern.

## Where things live

```
design/
  report.css      ← shared stylesheet — the single source of truth (DO NOT inline into reports)
  template.html   ← copy this to start a new report
  assets/rabbit.svg ← the mark (reference copy; reports inline the <symbol>)
  <report>.html   ← finished reports live here, next to the css they link
.claude/skills/html-report/SKILL.md ← this file
```

Reports **link** the stylesheet (`<link rel="stylesheet" href="report.css">`) so a fix in
`report.css` improves every report at once. This is the deliberate trade: reports are not
single-file portable — see *Delivering a standalone file* below for when you need one.

## How to make a new report

1. **Copy the template:** `design/template.html` → `design/<name>.html`. Edit the `<title>`,
   header, TOC, and sections.
2. **Assemble, don't author.** Build the body by composing the components below. You should
   rarely need to write CSS — if you reach for it, first check the component isn't already
   there.
3. **Verify it renders** (see *Verifying*). Check the diagrams and any interactivity.
4. **Tell the Stakeholder where it is** and summarize what's in it.

## The palette

From `repo_workspace/resources/logo.html`. Tokens in `:root`:

- `--ink #111111` — text, borders, the action/solid colour
- `--paper #f3efe6` — background
- `--red #e30613` — accents, section numbers, the rabbit's `?`. **Reserved**: red is for
  accents and the question mark, never body text or whole fills of content.
- `--muted #6b675e` — secondary text
- `--line #d8d2c4` — hairline borders/dividers
- `--good #1f6f43` — the only "positive" green (use sparingly, e.g. an allowed path in a diagram)

Type: `"Helvetica Neue", Helvetica, Arial, sans-serif`; code in a mono stack. Heavy weights
(800) and tight letter-spacing for headings. Generous whitespace; everything sits in white
cards with 1.5px ink borders on the paper ground.

## Component inventory (what's already styled)

Every component below is in `report.css`. Markup skeletons are in `template.html` and shown
live in the reference report. Reach for these before writing anything new:

| Component | Class(es) | Use for |
|---|---|---|
| Header | `header` + `.eyebrow` `.titleline` (svg + `h1`>`.q`) `.lede` `.badges`/`.badge`(`.accepted`/`.red`) | Title block with the rabbit + status badges |
| Table of contents | `nav.toc` > `a` > `.n` | Sticky-feel section index |
| Section | `section` + `.sec-head`(`.num` + `h2`), `h3`, `p`, `ul.body`/`ol.body` | The basic prose unit |
| Decision callout | `.decision` (+ `.eyebrow` `h2` `p`) | The one big "we will…" statement (dark) |
| Summary cards | `.subdec` > `.sd` (`.k` `h4` `p`) | A 2-col grid of sub-decisions / key points |
| Principle banner | `.principle` (red rule; `style="border-left-color:var(--ink)"` for the quiet variant) | A boxed guiding statement |
| Definition card | `.defcard` (`.dc-head`>`.dc-kicker`/`.dc-term`, `.dc-body`>`.dc-detail`>`dl.spec`>`dt`/`dd`, `.dc-foot`) | Define a term: plain meaning + a technical spec table + provenance/version footer |
| Figure + diagram | `figure`>`.stage`>`svg`, `figcaption`>`b` | A captioned SVG diagram |
| Diagram primitives | `.d-box`/`.d-box-ink`/`.d-box-paper`, `.d-t`/`.d-t-w`/`.d-s`/`.d-s-w`/`.d-lbl`, `.d-line`/`.d-line-red`/`.d-line-good`/`.d-dash` | Boxes, text, and connectors inside an svg |
| Interactive toggle | `.toggle`>`button[aria-pressed]` (+ `.danger`), `.hidden` | Swap between two diagram/states |
| Tradeoff columns | `.cols`>`.col.win`/`.col.cost`>`h3`+`ul`>`li` | Gains vs costs, pros vs cons |
| Numbered rows | `.assume`>`.row`>`.a-n`+`.a-b`(`b`+`span`) | Assumptions, premises, enumerated findings |
| Roadmap steps | `.steps`>`.step`(`.now`)>`.s-n`+`.s-b`(`b`+`p`), `.pill`(`.now`) | Ordered build/rollout steps |
| Compact card grid | `.oq`>`.q`>`b`+`p` | Open questions, short notes |
| Footer | `footer`>`.wrap`>`p` | Closing line / pointers |

All grids (`.subdec`, `.cols`, `.oq`) collapse to one column under 820px; the TOC reflows too.

## Recipe — SVG diagrams

Diagrams are inline `<svg>` inside a `figure > .stage`, styled with the `.d-*` primitives so
they match the palette and scale responsively (`max-width:100%`).

- **Boxes:** `<rect class="d-box" .../>` (white), `d-box-ink` (filled), `d-box-paper` (tinted).
  Use `rx="4"` for the house corner radius.
- **Text:** `.d-t` (title), `.d-t-w` (title on ink), `.d-s` (small/muted), `.d-s-w` (small on
  ink), `.d-lbl` (red label). Center with `text-anchor="middle"`.
- **Connectors:** `.d-line` (ink), `.d-line-red`, `.d-line-good`, `.d-dash`. Arrowheads are a
  `<marker>` defined in that svg's own `<defs>` (markers are per-svg; give each a unique id and
  reference with `marker-end="url(#id)"`).
- Keep a sensible `viewBox` and let CSS scale it; don't set pixel width/height on the svg.

## Recipe — interactive toggle

For "trap vs fix" / "before vs after" comparisons:

- A `.toggle` with two `<button aria-pressed>`; add `class="danger"` to a button whose active
  state should be red rather than ink.
- Two sibling `<svg>` panels in the same `.stage`; the inactive one carries `.hidden`.
- A tiny script flips `.hidden` and the `aria-pressed` flags. The **generic** helper in
  `template.html` (`showPanel(id, btn)`) works by convention (`id="panel-<x>"`); for
  report-specific behaviour (e.g. also swapping a caption) write a small bespoke handler in
  that report, like `showIso` in the reference report. Keep page JS inline at the bottom.

## Recipe — favicon

The rabbit-on-a-paper-tile favicon is a self-contained `data:image/svg+xml;base64,…` URI in
`<head>` (no asset to ship). The template already has it — just keep it. To regenerate (e.g.
to change the tile), build the SVG (paper `<rect rx>` + the two rabbit `<path>`s inset via
`translate/scale`), base64-encode it, and paste into the `<link rel="icon">`. Generating it
from the inline `<symbol>` paths keeps it from drifting from the header mark.

## Maintenance — changing the shared stylesheet without breaking reports

`report.css` is a **contract**: every report depends on it. The discipline (also stated at the
top of the file):

1. **Additive only.** New content kind → a **new class** (and, if needed, a **new token**).
   Never repurpose or restyle an existing class — that silently changes reports you're not
   looking at.
2. **Token-driven.** New shared colours/measures become tokens; don't hard-code hexes in
   components.
3. **Scope report-specific tweaks to the report.** A one-off does **not** belong in `report.css`.
   Either put an inline `style="…"` on the element, or add a page-scoped block in that report's
   own `<style>` under a wrapper class (e.g. `.r-myreport .sd{…}`). Keep the shared file generic.
4. **When you add a shared component here, update this skill's inventory.** A component the skill
   doesn't list won't get reused.
5. **Re-verify the reference report** after any `report.css` change — it's the canary; if it
   still looks right, existing reports are safe.

## Delivering a standalone file

Linked CSS means a report isn't a single file. When you must hand someone one portable file
(email, attachment), inline at send-time: replace `<link rel="stylesheet" href="report.css">`
with `<style>` + the contents of `report.css`. (The favicon and rabbit symbol are already
inline, so that's the only step.) Treat the inlined copy as a throwaway export — keep editing
the linked version in `design/`.

## Verifying

`file://` is blocked for the browser tool; serve over HTTP:

```bash
cd design && python3 -m http.server 8799   # then open http://localhost:8799/<name>.html
```

Check: the header/rabbit/badges render; the TOC links jump; every diagram draws and fits;
any toggle swaps both panel and (if bespoke) caption; the favicon loads with no console 404.
Clean up the server and any screenshots when done.
