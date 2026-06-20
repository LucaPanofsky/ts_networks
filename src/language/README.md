# `src/language/` — the construct-module pipeline (sketch)

> **Status: sketch.** This is the greenfield, modular re-organization of the language
> front end discussed in the GavaLang exploration. It does **not** yet replace the
> Lezer + monolithic `tree-to-network` pipeline; it is built up module-by-module, and
> the current front end stays green until this one is ready to take over. Parsers and
> lowering are stubs (`throw "TODO"`); the point here is the **organization**.

## The idea in one rule

> **To add or change a construct, you touch exactly two places: add its kind to
> [`enums.ts`](enums.ts), and add a module folder.** Nothing else — no monolithic
> grammar to edit, no central tree-walker to extend.

That rule is the whole goal: make the language *easy to modify*. It is the additivity
property (every construct lowers to the same shape) expressed as filesystem structure.

## The pipeline

```
source ─split─▶ Block[] ─parse─▶ AstNode[] ─combine─▶ Registry ─emit─▶ one .js module
       (one shared     (each block        (merge-semantics:        (codegen: import the
        splitter)       → its module)      order-free, conflict)     runtime, run by eval)
```

- **[`pipeline/split.ts`](pipeline/split.ts)** — the *one* shared parser concern. It
  chunks the source into definition blocks (leading keyword + balanced `end`, skipping
  comments and the triple-quoted Ohm/expression blobs) and tags each with its
  `ConstructKind`. The modules never have to compose grammars: each parses an
  already-isolated block.
- **a module per construct** (`constructs/defrecord/`, `defn/`, `defnetwork/`, …) — each
  owns the TS type of the node it returns, its own Ohm parser, *and* its emitter.
- **[`pipeline/combine.ts`](pipeline/combine.ts)** — folds the nodes into a registry
  under **merge *semantics*** (the principle, not the propagator implementation):
  order-independent, and a name collision carrying incompatible info is a
  **conflict/error**, never last-writer-wins. Keep these two properties and the real
  algebra can drop in later.
- **[`pipeline/emit.ts`](pipeline/emit.ts)** — the back end. Each construct emits a JS
  source fragment; the assembly wraps them in one self-contained module that imports the
  runtime and is run by `eval`/`import()`. The emitted **`.js` file is the deliverable**
  — a portable, auditable compiled artifact (see Emission below).

## The layout — three layers by dependency direction

The folders mirror the dependency graph, which is **acyclic**: `core/` ← `constructs/`
← `pipeline/`. This is what keeps the design legible (and gives the analysis tool clean
layers instead of one flat bag of files).

```
src/language/
  index.ts                public API: parseProgram / compileProgram / emitJs
  core/                   ◀ LAYER 0 — construct-agnostic; depends on nothing here
    enums.ts                the closed alphabet (ConstructKind + keyword→kind)
    types.ts                foundational types (TypeRef, Signature, AstNodeBase, Block)
    module.ts               the ConstructModule contract + EmitCtx (speak AstNodeBase only)
    runtime-api.ts          the @tsn/runtime boundary — what emitted code may call
  constructs/             ◀ LAYER 1 — one self-contained module per construct
    defrecord/  defn/  defnetwork/      (each imports only from core/)
  pipeline/               ◀ LAYER 2 — assembles the constructs; depends on both layers
    program.ts              the closed AstNode union + Program
    registry.ts             installed modules, keyed by kind
    split.ts                source → Block[]
    combine.ts              Block-parsed nodes → Registry (merge semantics)
    emit.ts                 program → one .js module (string)
```

The key layering move: the **contract** (`core/module.ts`) speaks only `AstNodeBase`
(`{ kind, name }`), never the concrete union — so `core/` does not depend on
`constructs/`. The closed union `AstNode` and the module table are assembled up in
`pipeline/`, the only layer that names every construct.

## A module is five files

```
constructs/defrecord/
  ast.ts        the TS type this construct produces  ("what we expect back")
  grammar.ohm   its own Ohm parser (block text → parse tree)
  parse.ts      front end: block text → typed ast.ts node
  emit.ts       back end:  ast.ts node → JS source fragment
  index.ts      exports the ConstructModule { kind, keyword, parse, emit }
```

## Emission — the .js artifact and the runtime boundary

`emit` is code generation. The whole program lowers to **one self-contained `.js`
module** that imports the runtime and is run by `eval`/`import()`:

```js
import * as rt from "@tsn/runtime";
const __reg = rt.registry();

// defrecord Point — PURE JS, needs nothing but the registry:
const Point = (x, y) => ({ __type: "Point", x, y });
__reg.register("Point", { arity: 2, impl: Point, morphism: { from: ["Number?","Number?"], to: "Point?" } });
const Point$ = (v) => v != null && v.__type === "Point";
__reg.register("Point?", { arity: 1, impl: Point$, morphism: { from: ["Any?"], to: "Boolean?" } });

// defnetwork — a DATA literal + a runtime call; leaves resolve by name (late-bound):
const rectangleMetrics = rt.network(
  { signature: { from: ["rect"], to: "area" },
    terms: [{ kind: "propagate", fn: "rectangleArea", from: ["rect"], to: "area" }] },
  __reg.resolve);
__reg.register("network/rectangleMetrics", { arity: 1, impl: rectangleMetrics, morphism: { from: ["rect"], to: "area" } });

export default __reg;
```

Two rules make this work:

- **Every construct emits source.** The pure ones (record, fn) emit plain JS; the heavy
  ones (grammar, extract, network, llmfn) emit a thin call into the runtime with their
  spec inlined as data. Single provenance — there is no second "build a closure" path.
- **The runtime is the frozen core; the emitted file is the variable program.**
  [`core/runtime-api.ts`](core/runtime-api.ts) is the entire surface emitted code may
  call (`merge`, `registry`, `grammar`, `extract`, `network`, `llmFn`, …). Keep it small
  and stable: every entry is something artifacts depend on forever. When in doubt, push
  logic into the regenerable emitted source, not the un-regenerable runtime.

## Emerging details (parked, decide when they bite)

- **Shared primitives vs. self-containment.** `TypeRef` / `Signature` are used by more
  than one construct; they live in [`core/types.ts`](core/types.ts) for now. If a
  construct wants to specialize one, revisit.
- **The expression sub-language** (`defn` bodies) is itself a grammar. The sketch keeps
  `defn` bodies as raw text (`ExprNode = { kind: "raw" }`), so `emit.ts` for `defn` is a
  stub — it needs the expression compiler. Promoting expressions to their own parser +
  emitter is a later slice.
- **The static face (`morphism`) is on record but unused.** `core/types.ts` defines
  `Morphism`/`EntryDecl`; today each `emit` writes the morphism inline into the
  registration. When the type checker arrives it will want morphisms *without* emitting —
  likely a `morphisms(node)` method beside `emit`. Deferred until there's a checker.
- **Emit status.** `defrecord` emits for real (the pure path); `defn` and `defnetwork`
  are documented stubs (their intended output is shown in their `emit.ts`). `split`/
  `parse` are still stubs, so the end-to-end string isn't runnable yet — the shapes and
  the contract are what's settled.
