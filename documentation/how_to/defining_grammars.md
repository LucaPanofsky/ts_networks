# How to: define grammars (`defgrammar`)

This is the practical guide to writing a `defgrammar` — an [Ohm](https://ohmjs.org)
grammar that turns text into typed records. It collects only the parts of Ohm that
matter for *our* use; for the full language see the references at the end.

The single most important thing to understand up front:

> **You write grammar *syntax* only — never semantic actions.** Most Ohm tutorials
> spend their time on `semantics` / `addOperation` (the JavaScript you attach to
> compute a result). We don't write any of that. `src/sandbox/grammar-runtime.ts`
> supplies **one generic capture rule** for every grammar: *a rule whose name
> matches a record field captures the text it matched into that field.* Your whole
> job is to shape the grammar so the right rules line up with the right fields.

---

## The shape of a `defgrammar`

```
defrecord Citation
  title:   String?;
  section: String?;
end

defgrammar Cite
  signature: from [String?(text)] to Citation?;
  """
  Cite {
    cite    = title spaces "U.S.C." spaces "§" spaces section
    title   = digit+
    section = digit+
  }
  """
end
```

- The Ohm grammar's name (`Cite {`) **must match** the `defgrammar` name.
- The body is a triple-quoted blob, **opaque** to the `.tsn` parser. A malformed Ohm
  grammar is therefore *not* caught by `check`/`typecheck` — it throws at
  compile/run time. Test it (see [Testing](#testing-and-iterating)).
- The **signature** is the same `from [Pred?(name)] to Type` shape as `defn`, and it
  chooses the mode (below).

### The signature chooses the mode

| Return type | Mode | On no match |
|---|---|---|
| scalar `to Rec?` | **Parse** the *whole* string into one record. | `Contradiction` |
| vector `to [Rec?]` | **Scan**: return one record per embedded match of the start rule. | `[]` (never fails) |
| *(omitted)* | **Recognizer**: whole-string match, returns the matched text, no record. | `Contradiction` |

A scalar parse must consume the **entire** input — trailing unmatched text is a
`Contradiction`. A scan walks the input and collects every non-overlapping match of
the **start rule** (the first rule in the grammar), so partial/embedded structure is
fine and absence is just an empty list.

---

## How matches become record fields

The capture rule, in full:

- A grammar rule whose name **equals a record field name** captures the *entire text
  it matched* (its `sourceString`) into that field.
- Rules whose names don't match a field are **structural scaffolding** and capture
  nothing — use them for literals, separators, and grouping you don't want in the
  output.
- If a field-named rule matches **more than once**, the captures **accumulate into an
  array** — this is how you fill a `[Type?]` vector field.
- A **scalar** field takes the single capture (or the first, if a rule happened to
  match more than once); a **vector** field always becomes an array (empty if the
  rule never matched).

```
defrecord ArticleRef
  num:    [String?];   // every number in the reference
  subnum: [String?];   // every subsection number, if any
end

defgrammar GdprCite
  signature: from [String?(text)] to [ArticleRef?];
  """
  GdprCite {
    cite    = word spaces numbers     // `cite` is the start rule (whole reference)
    word    = "Articles" | "Article"  // literal — NOT captured (no `word` field)
    numbers = item (spaces sep spaces item)*
    item    = num sub?
    sub     = "(" subnum ")"          // parens are scaffolding; only subnum is captured
    num     = digit+                  // repeats → fills the num[] array
    subnum  = digit+
    sep     = "and" | "to"
  }
  """
end
```

A capture is the rule's **verbatim** matched text — including any leading/trailing
whitespace it consumed. If you want clean values, make the captured rule span
*exactly* the value (`num = digit+`) and keep surrounding whitespace/literals in the
parent rule.

---

## Ohm syntax you'll actually use

| Form | Meaning |
|---|---|
| `a b c` | sequence |
| `a \| b` | ordered choice — **first** alternative that matches wins |
| `x*` | zero or more |
| `x+` | one or more |
| `x?` | optional |
| `~x` | **negative** lookahead — succeeds if `x` does *not* match here; consumes nothing |
| `&x` | positive lookahead — succeeds if `x` matches; consumes nothing |
| `"..."` | literal string |
| `"a".."z"` | character range |
| `(...)` | grouping |
| `// ...`, `/* ... */` | comments inside the grammar |

### Built-in rules (don't redeclare these)

`any`, `letter`, `digit`, `alnum`, `lower`, `upper`, `hexDigit`, `space`, `spaces`,
`end`. They're always in scope:

- `any` — one character (including newline).
- `digit`, `letter`, `alnum` — one digit / letter / alphanumeric.
- `space` — one whitespace char (incl. newline); `spaces` — zero or more.
- `end` — end of input.

> **Gotcha we hit:** redeclaring a built-in fails with
> `Duplicate declaration for rule '...' (originally declared in 'BuiltInRules')`.
> We wanted to capture a point letter into a `letter` field but `letter` is built-in,
> so the rule/field was renamed to `label`. If your field name collides with a
> built-in, rename the field.

### Lexical vs. syntactic rules (whitespace)

This is the one structural concept worth internalising:

- A **lexical** rule has a **lowercase** name. It matches *exactly* what's written —
  no automatic whitespace handling.
- A **syntactic** rule has an **Uppercase** name. Ohm automatically skips whitespace
  (the `spaces` rule) *between* its terms.

**Our convention: write lexical (lowercase) rules and handle whitespace explicitly
with `spaces`.** It's predictable and matches the existing examples. So instead of
relying on a capitalised rule to skip blanks, write `word spaces numbers`.

---

## Recipes

**Capture a leaf value, exclude the surrounding literals.** Put the literal in the
parent; name only the value rule after a field:

```
section = "§" spaces num     // "§" not captured
num     = digit+             // captured into `num`
```

**Match free text up to the next marker** (the workhorse for legal prose):

```
body   = (~marker any)+      // consume anything until a marker would match
marker = paraMark | "("
```

`(~marker any)+` reads "while the next thing is *not* a marker, consume one
character." Use `*` instead of `+` if the run may be empty.

**Order alternatives longest-first.** Ordered choice takes the first match, so a
prefix must come *after* its extension: `"Articles" | "Article"` (otherwise
`"Article"` matches and leaves a dangling `s`).

**Fill a vector field** by letting a field-named rule repeat: `num (spaces num)*`
captures every `num` into the `num[]` array.

**Optional structure is free in scan mode.** A scan for something that may be absent
returns `[]`, not a failure — so you can probe for optional sub-parts without the
network erroring.

---

## Boundaries: scope the scan to the structure

A captured run of free text only stops where you *tell* it to. A point's body has no
boundary of its own — its boundary is the *end of its paragraph*. Scanning points
over a whole article therefore lets the last point bleed to end-of-input (it never
sees a following marker). The fix is **scope**: scan paragraphs first, then scan each
paragraph's body for points — `propagate ... as mapping` distributes the point-scan
over the paragraph vector so each scan runs on an already-bounded body. See
[`examples/gdpr_article_structured_extraction.tsn`](../../examples/gdpr_article_structured_extraction.tsn).

This is the general lesson: **match at the granularity of the boundary you have.**

---

## Calling a grammar

A grammar is invoked by its qualified name `grammar/<Name>`, in two places:

```
// As a propagator leaf in a network:
propagate grammar/Cite from [text] to citation;

// As an ordinary function call in an expression (grammars are synchronous):
defn enrichParagraph
  signature: from [Paragraph?(p)] to Paragraph?;
  expression
    Paragraph(p.number, p.body, grammar/PointScan(p.body));
end
```

To run a scalar grammar over the elements of a vector, wrap it in a `defn` and use
`propagate ... as mapping`. See the language reference's `defgrammar` and `propagate`
sections.

---

## Testing and iterating

A grammar is a **falsifiable conjecture** about a sublanguage's structure: a text
that *should* match but doesn't is a refutation that tells you to grow a rule. So
treat grammar development as test-driven.

1. **Sketch in the Ohm editor** — https://ohmjs.org/editor/ — paste the grammar and
   sample text, watch what matches. Fastest feedback loop, no `.tsn` needed.
2. **Run it** on real text:
   ```bash
   npx tsx scripts/run.ts <file.tsn> <network> text="$(jq -Rs . path/to/sample.txt)"
   ```
   (`jq -Rs .` turns a multi-line file into one JSON string for the cell.)
3. **Pin behaviour in a test.** The runtime is exercised directly in
   [`tests/sandbox/grammar-runtime.test.ts`](../../tests/sandbox/grammar-runtime.test.ts) —
   parse a small DSL, build the grammar, assert the captured record. Add a case for
   each shape the corpus reveals (and a negative for what must *not* match).

---

## Gotchas checklist

- **Grammar name must equal the `defgrammar` name.**
- **Ohm errors are not caught by `check`/`typecheck`** (the body is opaque) — only at
  compile/run. Test it.
- **Don't redeclare built-ins** (`letter`, `digit`, `space`, …) — rename the field.
- **Captures are verbatim `sourceString`**, whitespace included. Tighten the captured
  rule to trim.
- **Scalar parse must consume all input**; leftover text is a `Contradiction`. Use a
  trailing `any*` (uncaptured) if you only care about a prefix.
- **Lexical (lowercase) rules don't skip whitespace** — add `spaces` explicitly.
- **Order alternatives longest-first** in `|`.
- **Scope scans to the boundary** you actually have (see Boundaries).

---

## References

- Ohm syntax reference — https://ohmjs.org/docs/syntax-reference
- Ohm interactive editor — https://ohmjs.org/editor/
- Ohm API reference (mostly *not* needed here) — https://ohmjs.org/docs/api-reference
- Worked examples in our conventions: [`examples/citations.tsn`](../../examples/citations.tsn),
  [`examples/gdpr_article_structured_extraction.tsn`](../../examples/gdpr_article_structured_extraction.tsn)
- The capture/parse/scan runtime: [`src/sandbox/grammar-runtime.ts`](../../src/sandbox/grammar-runtime.ts)

## Changelog
