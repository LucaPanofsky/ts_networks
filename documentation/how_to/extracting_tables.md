# How to: extract text tables (`TTable`)

This is the practical guide to writing a `TTable` — a declaration that reads a grid of
**delimited cells** into one record per row. It is the table counterpart of a
[`defgrammar`](defining_grammars.md): where a grammar recognises prose, a `TTable` reads
a column layout — declaratively, with **no Ohm**.

The single most important idea up front:

> **A `TTable` is fully self-describing: a row record, a cell delimiter, and one declared
> header per field.** From those three things it maps columns to fields and validates
> every row. You write no patterns and no actions — you declare the table's shape and the
> runtime does the splitting, mapping, and checking.

Reach for a `TTable` when the data is *already a table* (pipe/comma/tab-delimited rows). For
free-running prose, reach for a [grammar](defining_grammars.md) instead.

---

## The shape of a `TTable`

```
defrecord Pair
  x: String?;
  y: String?;
end

TTable Pairs
  row:  Pair;        -- the record each data row produces
  cell: '|';         -- the cell delimiter (single-quoted!)
  header x = 'X';    -- column for field x, found by the header text 'X'
  header y = 'Y';
end
```

- **`row: <Record>;`** — the record each row becomes. Its fields *are* the columns.
- **`cell: '<delim>';`** — the delimiter between cells. **TTable string literals are
  single-quoted** (`'|'`, not `"|"`).
- **`header <field> …;`** — one per column (see the two modes below).

The table is callable as `TTable/Pairs` and returns `[Pair?]`.

---

## The first row is always the header

The first line that contains the delimiter is the **header row** — it is *consumed*, never
returned as data. How its contents are used depends on the mode you declare:

### Located mode — `header field = 'text'`

Each declared text is matched against a cell in the header row by **exact equality after
trimming**, so the column *order in the source is free* — you name the columns you want and
the table finds them.

```
TTable Pairs
  row:  Pair;
  cell: '|';
  header x = 'X';
  header y = 'Y';
end
```

```
X | Y |          ← header, consumed (matched by text)
a | b |          → Pair(x: "a", y: "b")
c | d |          → Pair(x: "c", y: "d")
```

A declared header whose text is **not found** in the header row is a `Contradiction` — the
table refuses to map a column it cannot locate.

### Positional / declared mode — `header field` (no text)

With no header texts, columns map by **declaration order**; the header line is still
consumed, but its *content is ignored*. Use this when the header is absent, shared across
several blocks, or simply not worth matching on.

```
TTable Rows
  row:  Equivalence;
  cell: '|';
  header old;          -- column 0
  header lisbon;       -- column 1
  header newNum;       -- column 2
end
```

> A table is **one mode or the other** — every header carries a text, or none do. Mixing
> the two is ambiguous and `typecheck` rejects it.

---

## Every row self-validates

The table does not guess. Two rules make a `TTable` trustworthy under the merge algebra:

- **An empty cell becomes `""`** — an *asserted absence*. This is not "no information": it
  is a positive claim that the cell is blank, and it will **contradict** a conflicting
  non-empty claim if the same field is written elsewhere.
- **A row whose cell count differs from the header's is a `Contradiction` at that row's
  position.** A malformed row is refused, not coerced — and because the contradiction sits
  *in the vector at that row*, the surrounding good rows survive.

A trailing delimiter is tolerated, so `a | b |` is two cells (the closing `|` does not add a
phantom third). `a | b | |` *is* three.

---

## Running a `TTable`

A `TTable` is a leaf like a grammar: `propagate TTable/<Name>` in a network.

```
defnetwork extractPairs
  signature: from [doc] to rows;
  propagate TTable/Pairs from [doc] to rows;
end
```

```bash
# The doc cell is a JS expression; jq quotes the file as one string literal:
npx tsx scripts/run.ts my-table.tsn extractPairs doc="$(jq -Rs . sample.txt)"
```

---

## Composition: a `TTable` inside a `defextract`

A `TTable` returns a typed vector (`[Row?]`) — exactly what a **scan-mode grammar** returns
— so it can be the **leaf of a [`defextract`](extracting_documents.md)** anywhere a scan
would go. The extract orchestrates the nesting; the leaf just returns typed records, and it
does not care whether that leaf is a grammar or a table.

```
defextract TreatyTotal
  within Annex using grammar/Annex
    scan TitleGroup as groups using grammar/TitleBlock;
    within groups
      parse TitleRow    as title using grammar/TitleRow;
      scan  Equivalence as rows  using TTable/Rows;     -- a table as the scan leaf
    end
  end
end
```

This is the **compose-by-type** principle: a leaf returns a typed record or `[Row?]`;
`defextract` nests; the leaf can be a grammar, a `TTable` (or, in principle, an `llmfn`).
The full worked example —  grouping table rows under their section titles via the extract's
span recursion, no fold — is
[`repo_workspace/examples/treaty_table/treaty_total.tsn`](../../repo_workspace/examples/treaty_table/treaty_total.tsn).

---

## What `typecheck` checks

A `TTable` is self-describing, so the invariant is that its declaration is internally
consistent:

- the **row record exists**;
- the **delimiter is non-empty**;
- every declared header maps to a **real field** of the row record — no unknown field, no
  duplicate;
- **every field has a header** (a column may not be left undeclared);
- headers are **all located or all positional**, never mixed.

A violation is reported against the offending `TTable` — fix it and re-run.

---

## Gotchas checklist

- **Single-quote the delimiter.** `cell: '|';`, not `cell: "|";`.
- **The first delimiter-line is the header and is consumed** — never a data row. If your
  data has no header line, prepend one (positional mode ignores its content anyway).
- **Located needs an exact-after-trim text match.** A header text that isn't found is a
  `Contradiction`, not a silent skip.
- **Declare every column.** A row-record field with no `header` is a type error — the table
  must be total.
- **Don't mix modes.** All headers carry a text (located) or none do (positional).
- **Empty cell ⇒ `""` (asserted absence), malformed row ⇒ `Contradiction` at that row.**
  These are features: they make the table contradict bad data instead of guessing.
- **`TTable/X` tokenises as one name** (the `/` is part of the name class), so it drops
  straight into `propagate TTable/X …` or a `scan … using TTable/X` with no special syntax.

---

## References

- Language reference: [`documentation/language.md`](../language.md) (`TTable`).
- Composing tables into a tree: [extracting documents](extracting_documents.md).
- Writing prose recognisers instead: [defining grammars](defining_grammars.md).
- Runtime: [`src/sandbox/ttable-runtime.ts`](../../src/sandbox/ttable-runtime.ts)
  (`compileTTable`, `validateTTable`).
- Worked example (composition): [`repo_workspace/examples/treaty_table/treaty_total.tsn`](../../repo_workspace/examples/treaty_table/treaty_total.tsn).

## Changelog

- Initial version: `TTable` with located and positional modes, header-row consumption,
  asserted-empty cells, per-row contradiction on malformed rows, and composition as a
  `defextract` scan leaf.
