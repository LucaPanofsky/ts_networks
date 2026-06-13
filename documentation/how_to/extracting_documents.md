# How to: extract structured documents (`defextract`)

This is the practical guide to writing a `defextract` — a declaration that turns a
document into a **nested tree of records** (an Article with many Paragraphs, each with
many Points). A [`defgrammar`](defining_grammars.md) gives you one *flat* record;
`defextract` composes grammars into a *tree*.

The single most important idea up front:

> **You write one single-element recognizer per *kind* of thing, then declare how they
> nest.** A grammar recognises *one* Paragraph (`to Paragraph?`); the extract's verb
> decides cardinality — `scan` finds many, `parse` finds one — and `within` blocks
> declare containment. You never hand-chain `as mapping`; the construct does it.

This guide assumes you can already write the grammars. If not, read
[defining grammars](defining_grammars.md) first — that is where the Ohm lives.

---

## The shape of a `defextract`

```
defextract GdprArticle
  within Article using grammar/Article
    scan Paragraph as paragraphs using grammar/Paragraph;
    within paragraphs
      scan Point as points using grammar/Point;
    end
  end
end
```

Read it as a tree: indentation is cosmetic, the `within` blocks carry the structure.
The extractor is callable as `extract/GdprArticle`.

---

## Three pieces, three jobs

A working extractor is always three layers. Keep them separate in your head:

**1. Records — the shape ("what").** Plain `defrecord`s, nested by reference. The
cardinality lives in the field types: `X?` is one, `[X?]` is many.

```
defrecord Point      label: String?;  body: String?;  end
defrecord Paragraph  number: String?; points: [Point?];      end   -- many points
defrecord Article    number: String?; paragraphs: [Paragraph?]; end -- many paragraphs
```

**2. Grammars — the recognisers ("how to spot one").** One grammar per kind, each a
**single-element** recogniser (`to <Record>?`). It captures that record's *own* scalar
fields (by the field-name rule) and knows nothing about nesting.

```
defgrammar Paragraph
  signature: from [String?(text)] to Paragraph?;
  """
  Paragraph {
    paragraph = number "." spaces body
    number    = digit+
    body      = (~paraMark any)+
    paraMark  = digit+ "."
  }
  """
end
```

**3. `defextract` — the wiring ("how they nest").** It carries only what a single
grammar can't express: the containment. Scalar leaf fields are already filled by the
grammars; the extract fills the *record-valued* fields.

---

## The three statements

| Statement | Meaning |
|---|---|
| `within <Record> using grammar/<G>` | **Root only.** `grammar/<G>` parses the whole input into one `<Record>`; this names the record the extractor returns, and its region is the whole input. |
| `scan <Record> as <field> using grammar/<G>` | Fill a **vector** field by scanning the current region for `<Record>` matches. |
| `parse <Record> as <field> using grammar/<G>` | Fill a **scalar** field with one `<Record>` match. |
| `within <field>` | Recurse into each element a prior `scan` produced, scoped to that element's matched text. |

Two spelling rules worth internalising:

- The **root `within` names a record type** (`within Article`) — it has no parent
  field, and it doubles as the return type.
- A **nested `within` names a field** (`within paragraphs`) — the vector field a prior
  `scan` filled.

---

## The verb decides cardinality

`scan` and `parse` are the one-vs-many switch, and the grammar is the *same* either way
(a single-element `to <Record>?`):

```
scan  Paragraph as paragraphs using grammar/Paragraph;  -- many → fills [Paragraph?]
parse Header    as header     using grammar/Header;     -- one  → fills Header?
```

This is why grammars are written `to Paragraph?`, not `to [Paragraph?]`. A scan-mode
(`to [Rec?]`) grammar would bake "many" into the grammar; here the *extract* decides.

---

## How recursion is scoped: spans, not fields

When `within paragraphs` recurses into each paragraph and scans points inside it, the
point scan must see **only that paragraph's text** — otherwise the points of paragraph 3
bleed into paragraph 4. The extract handles this automatically: each `scan` remembers the
**exact substring each match consumed** (its *span*), and `within` recurses into that span.

So you do **not** declare a region field. Paragraph needs a `body` field only if you
*want* the paragraph's text in your output — it is no longer plumbing.

---

## Worked example, end to end

The full Article-33 extractor is [`examples/gdpr_article_extract.tsn`](../../examples/gdpr_article_extract.tsn).
Build it in the three layers above, then:

```bash
# Type-check the wiring (records ↔ grammars ↔ verbs):
npx tsx scripts/typecheck.ts examples/gdpr_article_extract.tsn

# Run it (the doc cell is a JS expression; jq quotes the file as a string literal):
npx tsx scripts/run.ts examples/gdpr_article_extract.tsn extractArticle \
  doc="$(jq -Rs . examples/gdpr_article_33.txt)"
```

You get one `Article` — number and title, five `Paragraph`s, and the four `Point`s
nested under paragraph 3 (the others have `points: []`).

```
defnetwork extractArticle
  signature: from [doc] to article;
  propagate extract/GdprArticle from [doc] to article;
end
```

`extract/<name>` is a leaf like `grammar/<name>` and `network/<name>`: propagate it,
or call it from an expression.

---

## What `typecheck` checks

`typecheck` validates the wiring statically (so an LLM author gets feedback before
running):

- `scan` must fill a **vector** field; `parse` a **scalar** field.
- The bind's record, the field's element record, and the grammar's return record must
  all **agree** (`scan Paragraph as paragraphs using grammar/Paragraph` ⇒ field
  `paragraphs : [Paragraph?]`, grammar `to Paragraph?`).
- A `within <field>` must target a **vector-of-record** field on the current record.
- The root grammar must **return the root record**.

A mismatch is reported with the offending statement — fix it and re-run.

---

## Recipes

- **A leaf (no children).** Just `scan`/`parse` it — `Point` has no `within`, so it
  stops there.
- **Exactly one sub-record.** Use `parse` into a scalar field: `parse Header as header
  using grammar/Header;`.
- **Keep the matched text.** Add a `body: String?` field to the record and capture it in
  the grammar (a rule named `body`). It becomes output; the recursion still uses the span.
- **Two levels of "many".** Nest `within` blocks: `within paragraphs { … within
  subparagraphs { … } }` — as long as each level is a distinct record type.

---

## Gotchas checklist

- **Root names a type, nested names a field.** `within Article` (type, = return type)
  vs `within paragraphs` (field).
- **Verb ↔ field shape.** `scan` ⇒ the `as` field must be `[Rec?]`; `parse` ⇒ it must be
  `Rec?`. `typecheck` catches the mismatch.
- **Grammars are single-element (`to Rec?`), not `to [Rec?]`.** The verb scans, not the
  grammar.
- **The three names must agree** — bind record, field element, grammar return. A typo in
  any one is a type error.
- **Fixed depth only.** A record that contains itself (a section inside a section) is not
  yet expressible — there is no `recurse`. Spell out each level.
- **A grammar still has to be valid Ohm** (`check` validates it) and capture its own
  scalar fields — see [defining grammars](defining_grammars.md).

---

## References

- Language reference: [`documentation/language.md`](../language.md) (`defextract`).
- Writing the recognisers: [defining grammars](defining_grammars.md).
- Runtime: [`src/sandbox/extract-runtime.ts`](../../src/sandbox/extract-runtime.ts)
  (`compileExtract`, `validateExtract`).
- Worked example: [`examples/gdpr_article_extract.tsn`](../../examples/gdpr_article_extract.tsn).

## Changelog

- Initial version: `defextract` with `within`/`scan`/`parse`, span-based regions,
  single-element grammars (verb decides cardinality), and type-check rules.
