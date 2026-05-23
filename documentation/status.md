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
  - [ ] Async runner: full-featured
  - [ ] Reasoning runner: requires support for `noGoods` or SAT logic as a service
  - [ ] Tracing option: a full-featured async runner with propagators logging rational reasoning
- [x] DSL
  - [x] `defnetwork`, `defn`, `defpredicate`, `defrecord`, `derive`
  - [x] `defagent` — LLM agent with prompt template, signature, and `with:` config clause
  - [x] Expressions: literals, variables, binary/unary ops, field access, function calls, `let`, `if`, `decide`
  - [x] `match` — structural pattern matching on records with guards and wildcard arms
  - [x] Vector types — `[Type?]` in field declarations and return types
- [x] JSON schema derivation
  - [x] `buildSchemas` — derives JSON schema from `defrecord` definitions
  - [x] `deriveProtocol` — maps any return type to `{ schema, extract }` for agent API calls
  - [x] Nested record inlining, vector fields, user-defined predicate resolution
- [x] Agent runtime
  - [x] Anthropic SDK client: prompt interpolation, tool-forced structured JSON call
  - [x] Agents registered in the network registry alongside `defn` and `defrecord`
  - [ ] Async propagation in the network executor
