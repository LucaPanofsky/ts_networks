# Status overview

- [x] Information Structures — Nothing, Something, Contradiction, APromise, MergeObject
  - [ ] Reasoning (Value/Support, TMS/AMBTMS, ordered set operations)
- [x] Runner — sync (constraints + recursion) and async (`invokeAsync`, awaits APromise at recursion gate)
  - [ ] Reasoning runner
  - [ ] Tracing option
- [x] DSL — `defnetwork`, `defn`, `defpredicate`, `defrecord`, `derive`, `defenum`, `defllmfn`; expressions, `match`, vector types
- [x] JS code generator — compiles DSL to a self-contained JS module; sandbox evaluation; registry and network wiring
- [x] JSON schema derivation — `defrecord` → JSON Schema; nested inlining, vector fields, predicate resolution
- [ ] LLM function runtime — Anthropic SDK; structured JSON calls; async propagation via `invokeAsync`
- [x] Validation — references, arities, topology; wired into server
- [x] Static type checker — cell type inference (`writtenBy`/`readBy`), switch rules, error annotation
- [x] Operations layer — `parse`, `check`, `typecheck`, `compile-schemas`, `run`; MCP-ready
- [x] CLI scripts — thin adapters over operations
- [x] SSE dev UI — two-column editor/graph, zoom/pan/resize, REPL (wip)
  - [ ] Trace output
