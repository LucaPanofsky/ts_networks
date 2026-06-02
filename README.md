# Propagation Networks in TypeScript

A TypeScript implementation of propagation networks, a computational model based on accumulating partial information through a network of cells and propagators.

---

## Building Blocks

### Core Information Structures

An **information structure** is the blueprint for any value in the model. Every value — including `null`, errors, and plain data — is wrapped in an information structure.

All information structures implement:

| Method | Signature | Description |
|--------|-----------|-------------|
| `content` | `() → A` | Returns the wrapped value |
| `equals` | `(other) → boolean` | Structural equality, used by `merge` |
| `unpack` | `(f: A → B) → InfoStructure` | Apply `f` to the content (like `map`) |
| `flatten` | `() → InfoStructure` | Remove one level of nesting |
| `bind` | `(f: A → InfoStructure) → InfoStructure` | `unpack` then `flatten` (like `flatMap`) |
| `merge` | `(other) → InfoStructure` | Combine two information structures |

The primary algebraic operation is **`merge`**. Together with `Nothing` as the identity element, the information structures form a **commutative monoid** under merge:

- **Idempotent**: `merge(a, a) = a`
- **Commutative**: `merge(a, b) = merge(b, a)`
- **Associative**: `merge(merge(a, b), c) = merge(a, merge(b, c))`

### The Type Hierarchy

Values are ordered by how much information they carry:

```
Nothing  <  Something(v)  <  Contradiction
  (none)      (a value)       (inconsistency)
```

| Type | Represents | `merge` behaviour |
|------|-----------|-------------------|
| `Nothing` | absence of information (identity element) | always returns `other` |
| `Something<A>` | a concrete value | returns self if equal to `other`, else `Contradiction` |
| `Contradiction` | an inconsistency (absorbing element) | always returns self |

### The `I` function

`I(value)` is the entry point that lifts any raw JavaScript value into an information structure:

```typescript
I(null)          // → Nothing
I(undefined)     // → Nothing
I(new Error())   // → Contradiction("runtime/error", {}, error)
I(42)            // → Something(42)
I("hello")       // → Something("hello")
```

### The Network Language

Networks can be declared in a small DSL that compiles to a `DataNetwork`. A network definition names its inputs and output via a `signature`, then lists cells, constants, and propagators as terms.

```
defnetwork doubleAndAdd
  signature: from [x] to out;
  constant bias = 10;
  propagate double from [x] to doubled;
  propagate add from [doubled, bias] to out;
end
```

| Term | Purpose |
|------|---------|
| `signature: from […] to name;` | Declares the network's interface |
| `cell name = value;` | Declares a cell with an initial value |
| `constant name = value;` | Declares a read-only cell |
| `propagate fn from […] to name;` | Adds a propagator that calls `fn` |
| `propagate fn from […] to name with: k=v, …;` | Propagator with named parameters |

Function names in `propagate` are looked up in a `Registry` at compile time and wrapped with `naryUnpacking` to produce the runtime `Propagator`.

### Grammars (`defgrammar`)

A `defgrammar` carries an [Ohm](https://ohmjs.org/) grammar verbatim in a triple-quoted blob and exposes it as a callable named `grammar/<name>` — the same convention `network/<name>` uses, so a grammar can be propagated like any other function. Its **optional signature** uses the exact `from [Pred?(name)] to Type` shape as `defn`/`defllmfn` and binds matches to a record:

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

defnetwork parseCitation
  signature: from [text] to citation;
  propagate grammar/Cite from [text] to citation;
end
```

Field rules named to match the record's fields (`title`, `section`) capture their matched text into those fields; literals in the parent rule are not captured.

The **return type chooses the mode**:

| Signature | Mode | Result | On no match |
|-----------|------|--------|-------------|
| `to Citation?` | parse | matches the **whole** string → one `Citation` | `Contradiction` |
| `to [Citation?]` | scan | finds **every** embedded match → `[Citation]` | `[]` (empty) |

Scan is the island-parsing pattern (e.g. pulling all citations out of a long legal document); it is implemented with a synthesized Ohm supergrammar. With **no signature** a `defgrammar` is a bare recognizer returning the matched text. Two invariants are checked at compile time: the Ohm grammar must be valid, and its internal name must equal the `defgrammar` name.

See `examples/citations.tsn` for a runnable end-to-end example.

---

## Project Structure

```
src/
  info-structure.ts   — InfoStructure<A> interface + all core types
                        (Nothing, Something<A>, Contradiction, I)
  index.ts            — public re-exports
tests/
  algebraic-properties-1.test.ts  — ACI laws for merge
```

## Development

```bash
npm run build   # compile TypeScript → dist/
npm test        # run all tests
npm run dev     # watch mode
```

## Editor Support

### VS Code extension (`editors/vscode/`)

A minimal, **highlighting-only** VS Code extension for `.tsn` files. It is purely
declarative — a TextMate grammar plus a language configuration, with **no
language server and no compiled code**. It is not yet packaged or published; you
install it locally from the repo.

**Current state:** syntax highlighting only. It colours definition keywords
(`defnetwork`, `defrecord`, `defn`, `defpredicate`, `defllmfn`, `defgrammar`,
`defenum`, `derive`), structural keywords (`signature`, `from`, `to`,
`propagate`, `switch`, `match`, `when`, `let`, …), single-quoted strings,
triple-quoted `"""…"""` blocks (prompts and `defgrammar` bodies), `//` comments,
numbers, booleans, operators, Capitalized types/constructors, and namespaced
calls (`str/…`, `network/…`). There is **no** error checking, hover,
go-to-definition, or other LSP behaviour.

**Caveat:** this TextMate grammar is **independent** of the Lezer grammar in
`src/data-network/grammar.grammar` (VS Code cannot consume Lezer). The two are
maintained separately; the keyword list is the only thing that must be kept in
sync when the language changes.

**Install (local):** symlink the folder into your VS Code extensions directory
and reload the window:

```bash
ln -s "$(pwd)/editors/vscode" ~/.vscode/extensions/tsn-syntax-0.0.1
```

See `editors/vscode/README.md` for details and for packaging a `.vsix`.

## Other Types

### `MergeObject` & plain objects

A plain object wrapped with `I({ x: 1 })` becomes `Something({ x: 1 })`. Its `merge` is **base semantics**: two `Something` values merge successfully only if they are identical; any difference produces a `Contradiction`. There is no awareness of fields.

`MergeObject` lifts each field of the object individually into its own `InfoStructure`, enabling **recursive merge semantics**: two `MergeObject`s merge field by field, unioning keys that appear in only one side and merging values that appear in both. A conflict in a single field bubbles up as a `Contradiction` for the whole object.

This makes `MergeObject` a safe accumulator for partial information: different propagators can each contribute a subset of fields, and the cell will accumulate them without conflict as long as no field is asserted twice with different values.

**Functional behaviour is equivalent.** Both `Something({x:1})` and `MergeObject.lift({x:1})` deliver the same plain object `{x:1}` to a `bind` or `naryUnpacking` function. The distinction is purely in how `merge` treats incoming information.

## References

- Sussman, Gerald Jay & Radul, Alexey — **[The Art of the Propagator](https://dspace.mit.edu/entities/publication/295b4ade-7ab5-4787-b5d1-417905fe7ab0)** (MIT-CSAIL-TR-2009-002, January 26, 2009)

- Hanson, Chris & Sussman, Gerald Jay — **Software Design for Flexibility: How to Avoid Programming Yourself into a Corner** (MIT Press, 2021)