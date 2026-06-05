# Status overview

- [x] Information Structures — Nothing, Something, Contradiction, APromise, MergeObject
  - [ ] Reasoning (Value/Support, TMS/AMBTMS, ordered set operations)
- [x] Runner — sync (constraints + recursion) and async (`invokeAsync`, awaits APromise at recursion gate)
  - [ ] Reasoning runner
  - [ ] Tracing option
- [x] DSL — `defnetwork`, `defn`, `defpredicate`, `defrecord`, `derive`, `defenum`, `defllmfn`, `defgrammar`; expressions, `match`, vector types; `network/<name>` composition
- [x] JS code generator — compiles DSL to a self-contained JS module; sandbox evaluation; registry and network wiring
- [x] JSON schema derivation — `defrecord` → JSON Schema; nested inlining, vector fields, predicate resolution
- [x] LLM function runtime — Anthropic SDK; structured JSON calls; async propagation via `invokeAsync`
  - [x] Tool loop — agentic `with: tools` (bounded rounds, forced final `respond`); `parse` tool exposed
  - [ ] Expose remaining program-reasoning tools (typecheck, compile-schemas, …)
- [x] Validation — references, arities, topology; wired into server
- [x] Static type checker — cell type inference (`writtenBy`/`readBy`), switch rules, error annotation
- [x] Operations layer — `parse`, `check`, `typecheck`, `compile-schemas`, `run`; MCP-ready
- [x] CLI scripts — thin adapters over operations
- [x] (STALE) SSE dev UI — two-column editor/graph, zoom/pan/resize, REPL (wip)
  - [ ] Trace output
