# Language core

The vocabulary the rest of the wiki assumes. A `.tsn` program is a sequence of top-level
definitions; order doesn't matter. Two ideas: **networks** (graphs of cells through which typed
data flows until they settle) and **leaves** (the functions wired between cells). For extraction
you mostly declare record types, write `defgrammar`/`defextract` leaves, and wire them in one
`defnetwork`. Every statement ends with `;`; blocks end with `end`. Comments are `//` or `--`
(but **inside** a `defgrammar` Ohm body only `//` and `/* */` work — see defining-grammars).

Types are written with a trailing `?` (`String?`, `Number?`, `Boolean?`, `MyRecord?`). A vector
type is `[String?]`, `[LineItem?]`. The `?` is the information wrapper — a cell holds `Nothing`,
`Something(v)`, or `Contradiction`; it is not "optional" in the TypeScript sense.

---

## `defrecord` — a typed struct

```
defrecord LineItem
  description: String?;
  unitCost:    String?;
  quantity:    String?;
  amount:      String?;
end
```

Auto-generates a constructor `LineItem(description, unitCost, quantity, amount)` and a predicate
`LineItem?(v)`. Fields may be scalar (`String?`) or vector (`[LineItem?]`). Records nest freely —
a field can be another record (`seller: Party?`) or a vector of records (`items: [LineItem?]`).
**Records are the deliverable shape**: sketch them first, the grammars just fill them. Extraction
records are almost always `String?` fields (you capture text spans; convert later if asked).

> **Names** (records, enums, fields, params, fns) are letters/digits/`_`, may start with a letter
> or `_`, and may carry the Clojure-style `?`/`!` suffixes — e.g. `bar_baz`, `ok?`, `valid!`. (The
> `?` in a *type* like `String?` is the predicate marker, separate from the field name.)

## `defenum` — a finite set of strings

```
defenum Status
  'PAID', 'DUE', 'VOID';
end
```

Generates a predicate `Status?(v)` and constrains the JSON Schema. Use when a field is one of a
known set.

## `defn` / `defpredicate` — pure functions

```
defn hypotenuse
  signature: from [Number?(a), Number?(b)] to Number?;
  expression
    let a2 = a * a;
    let b2 = b * b;
    sqrt(a2 + b2);
end

defpredicate positive?
  signature: from [Number?(n)] to Boolean?;
  expression n > 0;
end
```

A `signature` is `from [Pred?(name), ...] to ReturnType?`. The body is a single `expression`:
literals, field access (`r.width`), binary/unary ops, function calls, `let` bindings, and
`match` on records with `when` guards. `defpredicate` is just a `defn` returning `Boolean?`.
You rarely need these for pure text extraction, but they're how you post-process or run a scalar
grammar over a vector (see defining-grammars → "Calling a grammar").

## `defgrammar` — text → records

The workhorse. Full guide: **[defining-grammars.md](defining-grammars.md)**. Shape:

```
defgrammar Invoice
  signature: from [String?(text)] to Invoice?;     //  to Rec?   = parse whole string
  """                                              //  to [Rec?] = scan for many
  Invoice { ... ohm body ... }
  """
end
```

A rule whose name equals a record field captures that node's text into the field. `to Rec?`
parses the whole input (must consume all of it); `to [Rec?]` scans for every embedded match.

## `defextract` — assemble nested records

How you plumb sub-records and lists onto a root. Full guide:
**[extracting-documents.md](extracting-documents.md)**. The verb (`parse`/`scan`), not the
grammar, decides one-vs-many, so grammars are written single-element. Sketch:

```
defextract InvoiceDoc
  within Invoice using grammar/Invoice
    parse Party    as seller using grammar/Seller;
    parse Party    as billTo using grammar/BillTo;
    scan  LineItem as items  using grammar/LineItem;
  end
end
```

## `TTable` — column-aligned text tables

For flat tabular data (rows of aligned columns). Full guide:
**[extracting-tables.md](extracting-tables.md)**.

---

## `defnetwork` — wire it together

A network is a graph of named **cells** connected by **propagators**. It settles when no
propagator can fire again. For extraction it's usually one line:

```
defnetwork extractInvoice
  signature: from [doc] to invoice;
  propagate extract/InvoiceDoc from [doc] to invoice;
end
```

`propagate <leaf> from [inCells] to outCell` fires `<leaf>` when its inputs are present and
writes the result downstream. Qualified leaf names: `grammar/Name` (a `defgrammar`),
`extract/Name` (a `defextract`), `TTable/Name` (a table); a bare name is a `defn`/`defllmfn`.

Forms you may use:

```
propagate fn from [a, b] to out;                 // basic
propagate fn from [a]    to out with: k = v;      // pass options
propagate fn as mapping  from [vec] to out;       // run a scalar leaf over each element of a vector
switch pred? from [input] to flag;                // predicate test → Boolean cell
switch from [flag, value] to out;                 // gate: pass value once flag is truthy
```

`as mapping` is the key one for extraction: it distributes a scalar grammar/`defn` over a vector
field — the way you scan a sub-structure inside each already-bounded element (see
defining-grammars → "Boundaries").

You run a network with `tsn-run <file.tsn> <networkName> doc=@<file>.txt`, seeding the input
cell(s). The settled cell values come back as the result; `tsn-typecheck` first to catch
record↔grammar↔verb mismatches before running.
