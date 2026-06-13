# How to: handle a "extract this PDF" request (agent playbook)

This is the **methodology** an agent (you) follows when a user hands you a PDF and asks
for its information as structured data. It sits *above* the language how-tos: it tells you
the order of operations, what to look at, and how to decide the shape — then hands off to
[defining grammars](defining_grammars.md), [extracting documents](extracting_documents.md),
and [extracting tables](extracting_tables.md) for the construct mechanics.

The one idea to hold onto before anything else:

> **You are not writing a universal PDF parser. You are compiling one deterministic
> extractor, fitted to the document the request is about.** The program is the artifact;
> running it is pure code with no model in the loop. Generality across document variants is
> a *cost the user pays only when they ask for it* — not a default quality bar. If the
> request names one document, fit that document (and its obvious class). Don't invent
> robustness requirements and then grade yourself against them.

---

## The mental model: two reads of one document

A network is a **pure function of strings** (see the project design — impurity lives in the
tooling layer, never the runtime). So an extraction task is always: *get clean text, then
write a program that maps that text to records.* The subtlety is that you read the document
**twice, for two different purposes**:

| Read | Tool | Purpose | What it is |
|---|---|---|---|
| **The image** | Your own `Read` tool on the `.pdf` (renders the pages) | Recover the **layout** flat text destroys — columns, tables, where a value sits relative to its label | The **spec**. Teaches the document *class*. |
| **The `.txt`** | The `pdf-to-text` tool / `scripts/pdf.ts` | The exact, reproducible string the program will run on | The **substrate**. The *instance* the program consumes. |

Why both: PDF text extraction returns characters in **content-stream order**, which
*collapses* two-dimensional structure. A two-column header reads as one column's lines then
the other's; a table reads as a flat run of cells. The flat `.txt` cannot tell you that
"seller" and "bill to" are *side by side* — **the image can.** You use the image to decide
the record shape; you write grammars against the `.txt`.

Two consequences that change how you write the program:

- **The image informs the *design*, not the *instance*.** At runtime the program runs on
  `.txt` for documents you never saw — there is no image to cross-reference. Use the image
  to understand the document *kind* and write logic robust to the plain text; do **not**
  hardcode to pixel positions or the one example's exact line count.
- **Content-order text is good enough.** Its lossiness is covered by your image read during
  authoring, so you don't need high-fidelity layout extraction. The `--- page N ---`
  delimiters in the `.txt` let you align image-page *N* with text-region *N* when matching.

---

## The procedure

### 0. Get the substrate

The PDF lives in `WORKSPACE/`. Generate the text:

```bash
npx tsx scripts/pdf.ts <file>.pdf        # writes WORKSPACE/<file>.txt, prints a preview
```

(Or call the `pdf-to-text` MCP tool.) Pages are separated by `--- page N ---`.

### 1. Read both, in parallel

Open the **`.pdf` with your `Read` tool** (you'll see the rendered pages) *and* the
generated **`.txt`** in the same step. Don't skip the image — it is the only source of the
structure the text dropped.

### 2. Understand the document → decide the shape

From the image, name the **logical structure**: which things are scalar fields, which are
sub-records (a block of related fields → its own record), which are repeating lists/tables
(`[X?]`). A two-column block of fields is usually *two records*, not one run of lines —
that decision comes from the image, not the text.

Sketch the target `defrecord`s first. The shape is the deliverable; the grammars just fill
it.

### 3. Refresh the mechanics only if needed

If you're confident in the constructs, skip ahead. If not, the canonical sources — read the
*how-to* first, drop to *source* only when a how-to leaves a behavior ambiguous:

- [defining grammars](defining_grammars.md) — Ohm bodies, `parse` vs `scan`, how rule names
  become captures.
- [extracting documents](extracting_documents.md) — `defextract`: `within`/`scan`/`parse`,
  span-scoped recursion.
- [extracting tables](extracting_tables.md) — `TTable` for column-aligned rows.
- Source of truth when a how-to is silent: `src/sandbox/grammar-runtime.ts` (capture &
  match semantics) and `src/sandbox/extract-runtime.ts` (which region each bind runs over).

### 4. Write the three layers

Records → grammars → `defextract` wiring → a one-line `defnetwork`. See the worked example
below.

### 5. The verify loop — tight and ordered

```bash
npx tsx scripts/check.ts     <file>.tsn          # parses + grammar bodies are valid Ohm
npx tsx scripts/typecheck.ts <file>.tsn          # records ↔ grammars ↔ verbs agree
npx tsx scripts/run.ts       <file>.tsn <network> doc=@<file>.txt
```

Run them **in that order** — a parse error makes a type error meaningless. `doc=@<file>.txt`
seeds the **raw text of a workspace file** (read verbatim, *never* evaluated as JS). To
debug **one** grammar in isolation before wiring the whole extract, use the `run-grammar`
tool / a focused harness — it shows the parsed record, scanned records, or the located Ohm
failure for a single `defgrammar` against a sample string.

---

## The load-bearing mechanics (keep these in your head while designing)

These are the facts that decide whether a grammar is *correct*. Full detail in
[defining grammars](defining_grammars.md); the working summary:

- **A rule whose name equals a record field captures that node's text** (`sourceString`).
  Repeated matches of the same field-rule accumulate into an array; a scalar field takes the
  first. Structural/skip rules whose names don't match a field capture nothing — name them
  freely (`skipToSubtotal`, `preamble`, `trailer`).
- **`parse` (`to Rec?`) is a whole-string match.** The grammar must consume the *entire*
  input. So a `parse` grammar anchors on its block and **skips the rest** with
  `(~marker any)*` … `marker` … `any*`. This is why root and sub-record grammars end in a
  `rest = any*` / `trailer = any*`.
- **`scan` finds all non-overlapping matches** via an island scanner (`Item = start | any`).
  In `defextract`, the **verb decides cardinality** — write each grammar as a *single*
  recognizer (`to Rec?`) and let `scan` find many.
- **`defextract` regions:** the root parses the whole input; a **top-level** `scan`/`parse`
  bind runs over the **whole input**; a **nested `within field`** recurses into each match's
  **own span**. So sibling sub-records (e.g. `seller`, `billTo`) each parse the whole doc and
  must each anchor themselves — order between them doesn't matter.

---

## Design heuristics (how to make it robust to the *class*, not brittle to the *instance*)

- **Anchor on stable labels/markers, not positions.** `"Invoice Number " number` survives a
  shifted layout; "the value on line 3" does not.
- **Discriminate records by *shape* where you can.** In the invoice, a line-item row has
  *two* money columns (`<desc> $<unit> <qty> $<amount>`) while every totals line has *one* —
  so a single `scan` picks out exactly the items and ignores Subtotal/Tax/Amount Due. That's
  principled: it survives 1 item or 12, without counting lines.
- **Keep regions newline-bounded** (`(~nl any)+`) unless you *intend* to cross lines — `any`
  alone includes `\n` and will greedily swallow following lines.
- **Let optional fields be genuinely optional.** If a block lacks a column (the Bill To party
  has no phone), simply don't capture it — the field stays empty, not guessed.
- **Match the request's robustness target, no more.** Don't add comma-thousands / multi-page
  / multi-vendor handling unless the request (or the user, when you ask) calls for it. If a
  guarantee matters, that's information the user supplies — surface the question rather than
  silently over-build.

---

## Worked example, end to end

[`examples/invoice_example/`](../../examples/invoice_example/) is a complete instance of
this playbook — a GoRails-style invoice → a nested `Invoice` record (metadata, a `seller`
and a `billTo` `Party`, a `[LineItem?]` table, and totals). It bundles the source PDF, the
extracted `.txt`, the `invoice.tsn` program, and the `result.json` it produces. It shows the
two-column split (decided from the image), label-anchored scalar capture, and the
shape-based item/total discrimination.

```bash
npx tsx scripts/run.ts examples/invoice_example/invoice.tsn extractInvoice \
  doc=@example_invoice.txt
```

For a multi-level nested document (Article → Paragraphs → Points), see
[`examples/gdpr_article_extract.tsn`](../../examples/gdpr_article_extract.tsn).

---

## Gotchas checklist

- **Don't skip the image read.** The text alone hides every two-dimensional relationship.
- **`parse` grammars must consume the whole input** — anchor + skip + `any*`, or the match
  fails silently and you get a Contradiction.
- **`any` crosses newlines.** Bound line-scoped captures with `~nl`.
- **One grammar = one record (`to Rec?`).** The `scan`/`parse` verb, not the grammar, decides
  one-vs-many.
- **Sibling sub-records each see the whole doc** — each must anchor itself; don't assume a
  prior bind narrowed the region (only a nested `within` does that).
- **Fit the request.** A tightly-fitted program is the *correct* answer to "parse this
  document," not an overfit one. Generality is opt-in.

---

## References

- Mental model & infra: PDF→text + workspace design; `scripts/pdf.ts`, `doc=@file` seeding.
- Constructs: [defining grammars](defining_grammars.md),
  [extracting documents](extracting_documents.md), [extracting tables](extracting_tables.md).
- Tools for the loop: [MCP server](mcp_server.md) (`run-grammar`, `run-ttable`, `run`).
- Worked example: [`examples/invoice_example/`](../../examples/invoice_example/).

## Changelog

- Initial version: the two-read authoring loop (image = spec/class, `.txt` =
  substrate/instance), the zero-to-program procedure, load-bearing grammar/extract
  mechanics, design heuristics, and the fit-per-request principle.
