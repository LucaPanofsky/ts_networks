# `src/language/` — the construct-module pipeline

> **Status: live.** This modular front end is now the **sole** parser + emitter for the
> `.tsn` DSL. The old Lezer grammar + monolithic `tree-to-network` collector + `sandbox/jsgen`
> codegen, the `ProgramAST` container, and the `Program → ProgramAST` adapter have all been
> deleted; the modular `Program = { nodes }` is the one program shape end-to-end (analysis
> reads it through [`select.ts`](select.ts)). All eleven constructs parse and emit for real.
> See [`documentation/how_to/extending_the_language.md`](../../documentation/how_to/extending_the_language.md)
> for the step-by-step recipe.

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
  chunks the source into definition blocks (next-anchor: each region runs from a definition
  keyword to where the next one begins — it never counts `end`s; skipping comments and the
  triple-quoted Ohm/expression blobs) and tags each with its
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

## A module is four files

```
constructs/defrecord/
  ast.ts        the TS type this construct produces  ("what we expect back")
  parse.ts      front end: its own Ohm grammar (a string) + block text → typed ast.ts node
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

## Emerging details

- **Shared primitives vs. self-containment.** `TypeRef` / `Signature` are used by more
  than one construct; they live in [`core/types.ts`](core/types.ts). If a construct wants
  to specialize one, revisit.
- **The expression sub-language** (`defn` bodies) is its own grammar + compiler, in
  [`expr/`](expr/) (`compile.ts`); `defn`'s `emit.ts` lowers bodies through it. It is no
  longer raw text.
- **The static face (`morphism`).** Each `emit` writes the morphism inline into the
  registration; the type-checker reads it off the modular nodes via
  [`select.ts`](select.ts) rather than re-emitting — there is no separate `morphisms(node)`
  method.
- **Emit status: complete.** Every construct parses and emits for real, and the assembled
  module runs (in-process via `loadProgram`, or under plain `node` via the built
  `@tsn/runtime` — see [`runtime/load.ts`](runtime/load.ts)).
