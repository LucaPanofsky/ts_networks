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

### Structured Extraction (`defextract`)

A `defgrammar` produces a *flat* record; a `defextract` produces a *nested* tree of them — an Article with many Paragraphs, each with many Points. It declares the document's topology directly, instead of hand-chaining grammars with `as mapping`, and is callable as `extract/<name>`:

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

- **`within <Record> using grammar/<G>`** opens the root: the grammar parses the whole input into one record; the root names what the extractor returns.
- **`scan`** fills a vector field (many matches); **`parse`** fills a scalar field (one). The **verb decides cardinality** — the grammar is a single-element recognizer (`to <Record>?`) used either way.
- **`within <field>`** recurses into each scanned element, scoped to the **span that element matched**, so a nested scan sees only its parent's text (points stay inside their paragraph) — no region field to declare.

`typecheck` verifies the wiring: `scan`↔vector / `parse`↔scalar, the bind record == the field's element == the grammar's return, `within` targets a vector-of-record field, and the root grammar returns the root record. The tree is fixed-depth (no self-recursion yet). See `examples/gdpr_article_extract.tsn` for the full Article-33 extractor, runnable end-to-end.

### LLM Functions (`defllmfn`)

A `defllmfn` is a computation leaf whose body is a **prompt template** instead of code: at runtime it calls the Claude API and returns a value matching its declared return type. It uses the same `from [Pred?(name)] to Type` signature as `defn`/`defgrammar`, so downstream the network treats its result like any other — the only difference is that the leaf is *neural*.

```
defrecord DocumentAnalysis
  type:       String?;
  summary:    String?;
  confidence: Number?;
end

defllmfn analyzeDocument
  signature: from [String?(text)] to DocumentAnalysis?;
  with: model = 'claude-opus-4-7', max_tokens = '4096';
  """
  Analyze the document and return a structured result.

  {{text}}
  """;
end

defnetwork documentPipeline
  signature: from [text] to analysis;
  propagate analyzeDocument from [text] to analysis;
end
```

Parameter names wrapped in `{{` `}}` are substituted with their runtime values before the call. The optional `with:` clause configures the model (`model`, default `claude-opus-4-7`; `max_tokens`, default `16384`).

The **return type drives the response protocol**, and the JSON schema sent to the API is derived automatically from the program's `defrecord`/`defenum`/predicate declarations — no manual schema authoring:

| Return type | API is asked for | Runtime does |
|-------------|------------------|--------------|
| `Record?` | the record's fields directly | injects `__type` |
| `String?` / `Number?` / … | `{ value: … }` | unwraps `value` |
| `[Type?]` | `{ items: [...] }` | unwraps the array |

Because an llmfn leaf is **async**, it returns an `APromise` into its cell. `run` drives the async runtime (`invokeAsync`) and awaits terminal leaves, so the cell resolves to the real value rather than `∅`; an API or parse failure surfaces as a `Contradiction`, not a silent empty.

#### Tools (under development)

An llmfn can be given **tools** — host capabilities the model may call mid-generation — via the `with:` clause:

```
with: tools = 'parse';
```

Tools are TypeScript functions, not DSL constructs; the program only *selects* them by name. When tools are present the call runs as an agentic loop (the model calls tools until it stops, then a final step coerces the declared structured output); without them it is a single structured call. Today the registry exposes one tool, `parse`, which checks that `.tsn` source the model wrote is syntactically valid and **returns** the error as a value so the model can self-correct.

This is **early and under active development**. The goal is to expose the full set of capabilities that let an agent *reason about the program it is writing* — parsing, type-checking, schema compilation, and the other operations in `src/operations/` — so an LLM can author and refine `.tsn` programs against the same tools a human uses.

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
`defextract`, `defenum`, `derive`), structural keywords (`signature`, `from`,
`to`, `propagate`, `switch`, `match`, `when`, `let`, `within`, `scan`, `parse`,
`using`, …), single-quoted strings,
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