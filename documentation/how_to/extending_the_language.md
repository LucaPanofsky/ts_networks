# How to: extend the language

This document is the recipe for adding a new construct to the `.tsn` DSL (a new
top-level `defsomething`, a new term inside `defnetwork`, a new expression form,
etc.). It is written to be followed by either a human or an LLM: read it, then
implement the construct stage by stage.

The front end lives under [`src/language/`](../../src/language/) and is **modular**: one
self-contained folder per construct, each owning its own [Ohm](https://ohmjs.org/) parser
and its own emitter. There is **no** monolithic grammar and **no** central tree-walker to
edit. See [`src/language/README.md`](../../src/language/README.md) for the architecture in
depth.

---

## General principle

The language is a **pipeline**. Source text flows through fixed stages:

```
source text
   │  split            src/language/pipeline/split.ts        (one shared splitter →
   ▼                                                          Block[] tagged by kind)
definition blocks
   │  parse            src/language/constructs/<x>/parse.ts   (each block → its node, via Ohm)
   ▼
AstNode[]  (Program = { nodes })   src/language/pipeline/program.ts
   │  combine          src/language/pipeline/combine.ts       (merge semantics → registry)
   ▼
checked program
   │  emit             src/language/constructs/<x>/emit.ts    (each node → a JS fragment)
   ▼
one self-contained .js module   →   @tsn/runtime   →   runnable network
```

The deliverable of `emit` is a single self-contained `.js` artifact that imports only
`@tsn/runtime`. Analysis (the type-checker, schema emission) reads the same `Program =
{ nodes }` directly through the **selectors** in
[`src/language/select.ts`](../../src/language/select.ts) — there is no separate "checked AST"
shape; the modular `Program` is the one program shape end-to-end.

**Adding a construct means giving it a module and wiring it into the pipeline.** You rarely
need every stage at once — how far you go depends on what the construct *is*:

- A **declaration** that only needs to be parsed and represented (a record, an enum, a
  parameter) needs a full module (parse + emit) but its `emit` may produce nothing runnable
  (a documenting comment). It stops short of the type-checker and runtime wiring.
- A **callable** that participates at runtime (a function, an LLM function, a grammar)
  additionally registers a runtime entry in its `emit`, may need a new `@tsn/runtime`
  primitive, and is taught to the type-checker.

Decide the target depth first, and say so — it is fine and normal to land a construct at
"parse + carry" and defer the runtime teeth to a later change (that is exactly what
`defparameter` and `derive` do today).

Two project rules govern the whole process:

- **Tests first (TDD).** Write the parse tests before touching the grammar. See the test
  methodology in [`CLAUDE.md`](../../CLAUDE.md) (capabilities / invariants / negatives /
  units).
- **The suite stays green.** Run `npm test` and `npm run typecheck` (which checks **both**
  `src/` and `tests/`). There is no parser-generation step — Ohm grammars are plain strings
  parsed at module load, so nothing is generated or git-ignored.

---

## The "two places" rule, in full

The modular goal is: *to add a construct you touch its module folder and the closed alphabet,
and nothing in any other construct.* Concretely, a new construct touches these (and only
these) files:

1. **[`core/enums.ts`](../../src/language/core/enums.ts)** — the closed alphabet. Add a
   `ConstructKind` member; map your surface keyword to it in `KEYWORD_TO_KIND`; and, if the
   keyword is new, add it to `DEFINITION_KEYWORDS` (the splitter *anchors* on this set — a
   block runs to the next definition keyword).
2. **`constructs/<your-construct>/`** — the module folder (five files, below).
3. **[`pipeline/program.ts`](../../src/language/pipeline/program.ts)** — add your node to the
   `AstNode` union.
4. **[`pipeline/registry.ts`](../../src/language/pipeline/registry.ts)** — add your module to
   the `MODULES` table, keyed by your `ConstructKind`.

Steps 3 and 4 are the assembly points — the only two files in the whole tree that name every
construct. (`core/` deliberately speaks only `AstNodeBase = { kind, name }`, so it never
depends on `constructs/`; the concrete union is narrowed up in `pipeline/`.)

## A module is five files

```
constructs/defrecord/
  ast.ts        the TS type this construct produces  ("what we expect back")
  grammar.ohm   a readable, canonical copy of its Ohm grammar (docs; synced by hand)
  parse.ts      front end: block text → typed ast.ts node (holds the LIVE grammar string)
  emit.ts       back end:  ast.ts node → JS source fragment
  index.ts      exports the ConstructModule { kind, keyword, parse, emit }
```

The `ConstructModule` contract is in [`core/module.ts`](../../src/language/core/module.ts):
`parse(block) → node` and `emit(node, ctx) → string`. **Note the grammar lives twice:** the
live copy is a `GRAMMAR_SOURCE` string inside `parse.ts` (because `.ohm` files are not
importable under NodeNext/jest), and `grammar.ohm` is the readable canonical copy kept in
sync **by hand**. When you change one, change the other.

---

## The stages, as a checklist

1. **Write the parse tests** — `tests/language/<construct>.test.ts`. Encode the target syntax
   and the AST node you expect, plus at least one negative (malformed input must throw a parse
   error). The cross-construct splitter has its own tests in `tests/language/split.test.ts`.
2. **Alphabet** — `core/enums.ts`: `ConstructKind` member + `KEYWORD_TO_KIND` entry
   (+ `DEFINITION_KEYWORDS` if the keyword is new).
3. **AST type** — `constructs/<x>/ast.ts`: the node type, whose `kind` is your
   `ConstructKind` member and which carries a `name` (combine keys on it). Reuse shared shapes
   (`TypeRef`, `Signature`) from [`core/types.ts`](../../src/language/core/types.ts).
4. **Parser** — `constructs/<x>/parse.ts`: an Ohm grammar string + semantics producing the
   node; mirror it into `grammar.ohm`.
5. **Emitter** — `constructs/<x>/emit.ts`: the node → a JS source fragment (a comment, for a
   carry-only declaration).
6. **Module + wiring** — `constructs/<x>/index.ts` (the `ConstructModule`), then the union
   (`program.ts`) and the table (`registry.ts`).
7. **(Callables only)** teach the type-checker, ensure `emit` registers a runtime entry, add a
   runnable `repo_workspace/examples/*.tsn`, and note it in `README.md`.

Verify continuously: `npm run typecheck` after any type change, `npm test` for behavior.

---

## A worked example: `defparameter`

`defparameter` is a named, overridable network input with an optional default. Target syntax:

```
defparameter myArticle
  type: Text?;
  value:
    """ ... """;
end
```

It is a *declaration* — parsed and carried, but consumed by no runtime yet (cell-seeding
lands later with the `defnetwork` + `run` wiring). Here is each stage of its module
(see [`constructs/defparameter/`](../../src/language/constructs/defparameter/)).

**1. Tests first.** A `describe` in `tests/language/parameter.test.ts` that parses the snippet
and asserts the `ParameterNode`, plus a no-`value` case, an opacity case (punctuation inside
`value` is preserved verbatim), and a negative (missing `type:` throws).

**2. Alphabet** — in `core/enums.ts`:

```ts
export enum ConstructKind { …, Parameter = "parameter" }
export const KEYWORD_TO_KIND = { …, defparameter: ConstructKind.Parameter };
export const DEFINITION_KEYWORDS = [ …, "defparameter" ]; // splitter boundary anchor
```

**3. AST type** — `constructs/defparameter/ast.ts`. Reuse `TypeRef`; don't invent a parallel
shape:

```ts
export type ParameterNode = {
  kind: ConstructKind.Parameter;
  name: string;
  type: TypeRef;    // always a scalar TypeRef (a single type predicate)
  value?: string;   // optional default — absent means Nothing (the merge-algebra bottom)
};
```

**4. Parser** — `constructs/defparameter/parse.ts`. An Ohm grammar for the *isolated* block
(the splitter already cut it out — modules never compose grammars), plus semantics that build
the node. Opaque bodies (prompts, grammar source, free text) are captured with the
triple-quote idiom `"\"\"\"" (~"\"\"\"" any)* "\"\"\""`:

```ohm
Parameter {
  Main = "defparameter" ident TypeClause ValueClause? "end"
  TypeClause = "type" ":" ident ";"
  ValueClause = "value" ":" tripleString ";"
  tripleString = "\"\"\"" (~"\"\"\"" any)* "\"\"\""
  ident = letter identChar*
  identChar = alnum | "?"
}
```

```ts
const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, typeClause, valueOpt, _end) {
    const node: ParameterNode = {
      kind: ConstructKind.Parameter,
      name: name.ast() as string,
      type: { kind: "scalar", predicate: typeClause.ast() as string },
    };
    if (valueOpt.numChildren > 0) node.value = valueOpt.children[0]!.ast() as string;
    return node;
  },
  // … TypeClause / ValueClause / tripleString / ident actions …
});

export function parseParameter(block: Block): ParameterNode {
  const m = g.match(block.text, "Main");
  if (m.failed()) throw new Error(`parseParameter: ${m.message ?? "no match"}`);
  return semantics(m).ast() as ParameterNode;
}
```

Mirror the grammar into `grammar.ohm` (the readable copy).

**5. Emitter** — `constructs/defparameter/emit.ts`. Carry-only, so it emits a documenting
comment, not a runtime artifact:

```ts
export function emitParameter(node: ParameterNode, _ctx: EmitCtx): string {
  return `// defparameter ${node.name} : ${typeRefToString(node.type)} — network input; parse+carry only.`;
}
```

**6. Module + wiring** — `index.ts` exports the `ConstructModule`:

```ts
const parameterModule: ConstructModule<ParameterNode> = {
  kind: ConstructKind.Parameter,
  keyword: "defparameter",
  parse: parseParameter,
  emit: emitParameter,
};
export default parameterModule;
```

…then add `ParameterNode` to the `AstNode` union (`program.ts`) and
`[ConstructKind.Parameter]: parameterModule` to `MODULES` (`registry.ts`).

That is the whole change for a declaration. A read-only selector
(`parametersOf` in `select.ts`) lets later consumers find these nodes when the run-wiring
lands.

---

## Going further: callables

A construct that runs continues past `emit` into two more places:

- **A runtime registration in `emit`.** Pure constructs (record, fn) emit plain JS and a
  `__reg.register("<name>", { … })` line. Heavy constructs (grammar, extract, network, llmfn)
  emit a thin call into the runtime with their spec inlined as data — e.g.
  `rt.network(<spec>, __reg)` — then register it. Cross-references resolve **late** through
  `ctx.ref(name)` (a `__reg.resolve(...)` thunk), so fragments are order-independent and
  mutual recursion resolves at run time. Use `ctx.mangle(name)` for the binding identifier so
  definition and call sites line up.
- **A new `@tsn/runtime` primitive, only if unavoidable.** The runtime
  ([`core/runtime-api.ts`](../../src/language/core/runtime-api.ts), implemented in
  [`runtime/index.ts`](../../src/language/runtime/index.ts)) is the **frozen core**: every
  entry is something compiled artifacts depend on forever. Prefer emitting logic into the
  regenerable `.js` source; add a runtime helper only when the construct genuinely needs a new
  capability (as `grammar`/`extract`/`network`/`llmFn` each did).
- **The type-checker.** [`src/data-network/type-checker.ts`](../../src/data-network/type-checker.ts)
  consumes the modular `Program` and reads each construct family through a selector
  (`fnsOf`/`grammarsOf`/`networksOf`/…). Add a selector to `select.ts` for your kind (the
  one-line `byKind` cast), then teach the checker to validate your nodes. The `typecheck`
  operation parses once via `parseProgramStrict` and hands the `Program` to the checker.

Finally: a runnable `repo_workspace/examples/<name>.tsn` and a line in `README.md`.

---

## Conventions and gotchas

- **Reuse the shared shapes.** `TypeRef` (scalar / vector) and `Signature` live in
  `core/types.ts` and are used across `defn`, `defpredicate`, `defllmfn`, `defgrammar`. If
  your construct has a type or a signature, reuse them — uniform syntax is a design goal.
- **Keep the two grammar copies in sync.** `parse.ts` holds the live `GRAMMAR_SOURCE`;
  `grammar.ohm` is the readable copy. They drift silently if you edit only one (only the live
  copy is exercised by tests, so a stale `grammar.ohm` is a docs bug, not a test failure —
  reviewers rely on it).
- **The splitter anchors on keywords, it does not count `end`s.** A block runs from its
  keyword to the next `DEFINITION_KEYWORDS` member. So a new top-level keyword **must** be in
  `DEFINITION_KEYWORDS` or it gets swallowed into the preceding block — even constructs with
  no module yet are listed there purely as boundaries. Triple-quoted blobs and comments are
  skipped by the splitter, so opaque bodies can contain anything.
- **`combine` is merge semantics, not last-writer-wins.** Two declarations of the same key
  that differ are a `ConstructConflict`; an identical re-declaration is an idempotent no-op.
  The key is the **registry** key (`registryKey` in `combine.ts`): heavy constructs are
  namespaced (`grammar/X`, `extract/X`, `TTable/X`, `parameter/X`) so a `defgrammar Foo` and a
  `defrecord Foo` don't falsely collide; records/fns key by bare name. If your construct emits
  under a prefixed registry key, give it the matching prefix here.
- **The runtime is frozen; the emitted file is variable.** When in doubt, push logic into the
  emitted source, not `runtime-api.ts`.
- **Run the right command.** `npm test` (CJS + ESM passes; `pretest` typechecks first);
  `npm run typecheck` after any type change (covers `src/` **and** `tests/` — a bare
  `tsc --noEmit` checks only `src/`); `npm run test:all` to include the slow
  subprocess-based script tests. There is no parser-generation step.

## Changelog

- **Lezer/jsgen retired; modular Ohm front end is the sole parser + emitter.** The old
  monolithic `src/data-network/grammar.grammar` + `tree-to-network.ts` collector + `sandbox/jsgen`
  codegen, the `ProgramAST` container, and the `Program → ProgramAST` adapter are all deleted.
  The single program shape is now the modular `Program = { nodes }`, read by analysis through
  `select.ts`. This how-to was rewritten to match.
- `defextract` (full): a nested `within` / `scan` / `parse` structural extractor, callable as
  `extract/<name>`. A full module (`constructs/defextract/`) with a runtime leaf
  (`rt.extract`) and a type-checker pass (`validateExtract`). Runs end-to-end
  (`repo_workspace/examples/gdpr_article_extract.tsn`).
