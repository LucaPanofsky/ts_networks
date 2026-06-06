# Status overview

- [x] Information Structures — Nothing, Something, Contradiction, APromise, MergeObject
  - [ ] Reasoning (Value/Support, TMS/AMBTMS, ordered set operations)
- [x] Runner — sync (constraints + recursion) and async (`invokeAsync`, awaits APromise at recursion gate)
  - [ ] Reasoning runner
  - [ ] Tracing option
- [x] DSL — `defnetwork`, `defn`, `defpredicate`, `defrecord`, `derive`, `defenum`, `defllmfn`, `defgrammar`, `defextract`; expressions, `match`, vector types; `network/<name>` / `grammar/<name>` / `extract/<name>` composition
- [x] JS code generator — compiles DSL to a self-contained JS module; sandbox evaluation; registry and network wiring
- [x] JSON schema derivation — `defrecord` → JSON Schema; nested inlining, vector fields, predicate resolution
- [x] LLM function runtime — Anthropic SDK; structured JSON calls; async propagation via `invokeAsync`
  - [x] Tool loop — agentic `with: tools` (bounded rounds, forced final `respond`)
  - [x] Program-reasoning tools exposed — `parse`, `typecheck`, `compile-schemas`, `run`, `run-grammar`, `run-ttable` (per-fragment grammar/table runners with located failures)
- [x] Static type checker — cell type inference (`writtenBy`/`readBy`), switch rules, arity & predicate checks, error annotation; topology warnings (signature inputs should be sources, the output a terminal)
- [x] Operations layer — `parse`, `check`, `typecheck`, `compile-schemas`, `run`; MCP-ready
- [x] CLI scripts — thin adapters over operations
- [x] (STALE) SSE dev UI — two-column editor/graph, zoom/pan/resize, REPL (wip)
  - [ ] Trace output
