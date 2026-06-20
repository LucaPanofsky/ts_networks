---
name: authoring-tsn-programs
description: Author or modify a ts-networks `.tsn` program. Use whenever the task is to write, build, extend, or fix a `.tsn` program — it gives how a program is structured (types → functions & predicates → networks) and the verify-and-run loop. Domain-agnostic; for the document-extraction method see /knowledge/playbook.md.
---

# Authoring a `.tsn` program

## Structure and interpretation of `.tsn` programs

A `.tsn` program is a **model of something computable**. Write it in three layers, in this
order — each layer is written against the one before it:

1. **Types** — define the objects the program operates on: `defrecord` types (with enums and
   predicates) describing the shape of the data. Start here. The types are the vocabulary
   everything else is written against; getting them right first makes the rest fall out.
2. **Functions & predicates** — pure computation over those types. A function maps inputs to
   outputs with no state; a predicate decides a condition. No wiring yet — just the operations.
3. **Networks** — wire the functions together into a **propagator graph**. This is where
   computation actually happens: cells hold values, propagators (your functions) relate them,
   and running the network drives it toward a fixed point.

Look up the exact syntax and behavior of each construct **before** writing — the language has
specific rules you should confirm, not guess. `/knowledge/language-core.md` covers records,
enums, functions, networks, and `propagate`; the rest of `/knowledge` covers the more
specialized constructs.

## Verify, then run

Authoring is a loop, not a single shot. After writing — or changing — a program, run the
`tsn-*` tools on your `PATH` **in order**; a parse error makes a type error meaningless:

| step | command | passes when |
|---|---|---|
| 1 | `tsn-check <file.tsn>` | it parses (syntax + any grammar bodies) |
| 2 | `tsn-typecheck <file.tsn>` | types agree across records, functions, and networks |
| 3 | `tsn-run <file.tsn> <network> [cell=val …]` | the network executes and produces the value you expect |

"It works" means you ran it and read the result — not that it looks right. Iterate: fix what a
gate reports, then re-run from `tsn-check`, until `tsn-run` gives the intended output. When the
program is finished, leave it at `/workspace/out/program.tsn` with a short `/workspace/out/recap.md`.
