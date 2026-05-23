# Current Status

> This implementation follows the monadic approach discussed in the dissertation.
> The monadic approach did not appear in the reference article "The Art of the Propagator".

> Main differences from the reference:
> - The reference article and dissertation implement a generic dispatch system. This implementation is class-oriented and less extensible.
> - We follow the virtual copies approach.
> - New information structure: Promise 
> - New information structure: MergeObject (unification through merge) — fields are merged pairwise; fields present on only one side are carried over, fields present on both sides must agree or the result is a Contradiction. This is structural unification over the information lattice `Nothing < Something(v) < Contradiction`, not full Prolog-style unification: there are no logic variables or substitution.
>
> The framework is extensible: each information structure implements its own `merge` rules. Adding a new kind of information (e.g. intervals, preference orderings) means implementing the `InfoStructure` interface and defining how that type of information combines with itself and with others. `Nothing`, `Something`, `APromise`, and `MergeObject` are all instances of this pattern.

- [x] Information Structures framework
  - [x] Nothing
  - [x] Contradiction
  - [x] Something
    - [x] APromise
    - [x] MergeObject
  - [ ] Reasoning
    - [ ] Value and Support
    - [ ] TMS / AMBTMS
    - [ ] Ordered set arithmetic (e.g. interval, preferences)
- [x] Runner
  - [x] Default runner: handle constraints, sync recursion
  - [ ] Async runner: full-featured
  - [ ] Reasoning runner: requires support for `noGoods` or SAT logic as a service
  - [ ] Tracing option: a full-featured async runner with propagators logging rational reasoning
