# Current Status

> This implementation follows the monadic approach discussed in the dissertation.
> The monadic approach did not appear in the reference article "The Art of the Propagator".

> Main differences from the reference:
> - The reference article and dissertation implement a generic dispatch system. This implementation is class-oriented and less extensible.
> - We follow the virtual copies approach.
> - New information structure: APromise 
> - New information structure: MergeObject (unification through merge) — fields are merged pairwise; fields present on only one side are carried over, fields present on both sides must agree or the result is a Contradiction. This is structural unification over the information lattice, not full Prolog-style unification: there are no logic variables or substitution.
>
> ### Information lattice
>
> The base lattice is `Nothing < Something(v) < Contradiction`. `APromise` extends this with a suspended computation layer:
>
> - `Nothing` — no information yet (initial cell state; also the result of a computation that resolved to nothing)
> - `APromise` — information is in transit: a computation has been started but not yet resolved
> - `Something(v)` — a concrete value is known
> - `Contradiction` — conflicting information; terminal, propagation stops
>
> `APromise` does not sit at a fixed position in a simple total order. Its merge behaviour reflects two distinct roles of `Nothing`:
>
> | merge | result | reason |
> |---|---|---|
> | `Nothing.merge(APromise)` | `APromise` | A pending computation is more informative than no information |
> | `APromise(pending).merge(Nothing)` | `Nothing` | A definitive "no value" answer supersedes a still-waiting computation |
> | `APromise(realized).merge(Nothing)` | resolved value | The promise already has an answer; Nothing cannot override it |
>
> A realized `APromise` re-enters the base lattice by handing off its resolved `InfoStructure` value. `Contradiction` always wins regardless of the other side.
>
> The framework is extensible: each information structure implements its own `merge` rules. Adding a new kind of information (e.g. intervals, preference orderings) means implementing the `InfoStructure` interface and defining how that type of information combines with itself and with others. `Nothing`, `Something`, `APromise`, and `MergeObject` are all instances of this pattern.

- [x] Information Structures framework
  - [x] Nothing
  - [x] Contradiction
  - [x] Something
    - [x] MergeObject
  - [x] APromise  
  - [ ] Reasoning
    - [ ] Value and Support
    - [ ] TMS / AMBTMS
    - [ ] Ordered set arithmetic (e.g. interval, preferences)
- [x] Runner
  - [x] Default runner: handle constraints, sync recursion
  - [x] Async runner: `invokeAsync` — awaits `APromise` inputs at the recursion gate, enabling recursive networks with async (agent) steps
  - [ ] Reasoning runner: requires support for `noGoods` or SAT logic as a service
  - [ ] Tracing option: a full-featured async runner with propagators logging rational reasoning
- [x] DSL
  - [x] `defnetwork`, `defn`, `defpredicate`, `defrecord`, `derive`
  - [x] `defagent` — LLM agent with prompt template, signature, and `with:` config clause
  - [x] Expressions: literals, variables, binary/unary ops, field access, function calls, `let`, `if`
  - [x] `match` — structural pattern matching on records with guards and wildcard arms
  - [x] Vector types — `[Type?]` in field declarations and return types
- [x] JS code generator (`src/sandbox/jsgen/`)
  - [x] `compileProgram` — compiles `defn`, `defrecord`, and `defpredicate` definitions to a self-contained JS module string
  - [x] `createSandbox` — evaluates the compiled JS via `new Function` and returns a `Record<string, fn>` of all exported names
  - [x] `buildRegistry` — populates a `Registry` from the sandbox: constructors, field accessors, predicates, functions, and agents
  - [x] `buildNetworks` — builds a `NetworkRuntime` per `defnetwork` using the registry
  - [x] `compile(dsl)` — single entry point returning `{ sandbox, registry, networks }`
- [x] JSON schema derivation
  - [x] `buildSchemas` — derives JSON schema from `defrecord` definitions
  - [x] `deriveProtocol` — maps any return type to `{ schema, extract }` for agent API calls
  - [x] Nested record inlining, vector fields, user-defined predicate resolution
- [x] Agent runtime
  - [x] Anthropic SDK client: prompt interpolation, tool-forced structured JSON call
  - [x] Agents registered in the network registry alongside `defn` and `defrecord`
  - [x] Async propagation via `invokeAsync` in the network executor
- [x] Validation (`src/validation/`)
  - [x] Types and references check — all names used in networks resolve to known definitions
  - [x] Arities check — propagator call sites match the declared arity of the function
  - [x] Topology check (warning) — detects networks with no path from any input to the output
  - [x] `validateProgram` — runs all checks and returns a `ValidationReport` with errors and warnings
  - [x] Wired into `PUT /programs/:name` on the server
- [x] SSE dev UI (`src/ui-server/`)
  - [x] Express server with SSE (`/events`), push (`POST /push`), and run (`POST /run`) endpoints
  - [x] CodeMirror 6 editor with DSL syntax highlighting and read-only display
  - [x] Mermaid + ELK diagram rendering: cells as rounded nodes, propagators as lean-r, switches as delay
  - [x] Type-annotated edges: input edge labels from `TypedParam.predicate`, output labels from return type
  - [x] Multi-network select: programs with multiple `defnetwork` blocks show a dropdown to switch between them
  - [x] Rotate button: cycles diagram layout direction (`LR → TB → RL → BT`)
  - [x] Zoom, pan, and resizable editor/diagram panes
  - [x] Node detail dialog: click any cell or propagator to see its type information
  - [x] REPL terminal pane: toggle between editor and terminal, `Shift+Enter` to evaluate
  - [x] REPL `run` command: `run networkName with cell name = expr; end` — parses and executes a network with seeded cell values, displays results
  - [ ] Trace output: stream propagator execution steps to the terminal over SSE
