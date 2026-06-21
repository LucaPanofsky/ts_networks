# ts-networks — Claude Code Instructions

ts-networks is a **propagation-network runtime** hosting a small language parsed by a modular,
per-construct **Ohm** front end under [`src/language/`](src/language/).
The language has three layers: **types** (records and predicates), **functions** (pure
computation), and **networks** that wire functions together into propagator graphs. See
[`README.md`](README.md) for a short introduction to the project.

See the [`repo_workspace/examples/`](repo_workspace/examples/) folder for a quick tour of the language's features through small
programs you can run and adapt — geometry and search networks, document/table extraction, and an
LLM-function pipeline, among others.

**Current direction**

We are developing **Gavagai** — a containerized Claude Code instance that authors `.tsn` programs
using the language's own runtime and tools, isolated so it can *use* the language but not change
it (the read-only mount is OS-enforced). It runs headless or as an interactive web chat. See
[`documentation/lang_agent.md`](documentation/lang_agent.md) for the design.


## Design principles

The standing principles the codebase is held to — what the `grudge` auditor checks
against. Testing has its own rubric (see **Test methodology**); these cover
architecture, code, and naming.

**Single source of truth & functional architecture.** Every concept is defined
**once**. Two representations of one idea — parallel type families, copy-pasted
fragments, a runtime shape mirroring a syntax-tree node — reconciled by hand or by
unsafe casts are the drift failure mode this project exists to avoid: the thesis is
*one* typed, auditable representation that humans and agents can co-maintain safely.
Prefer **deriving** one shape from another over duplicating them, and enforce contracts
at **compile time** rather than trusting a cast. The code is layered **acyclically**,
and that ordering is load-bearing: when it forbids collapsing two shapes — a lower
layer cannot import a higher one to share its type — introduce the **minimal
projection/view type** and document why it is the irreducible limit, rather than
reaching for a cast. Single-source to a consistent degree, honest about the cases the
layering forbids.

**Comments & naming.** Names convey the idea; comments stay **in sync with the code**.
A comment describing behavior that no longer exists — a deleted type, a stale status
note, a renamed operation — is **worse than none**, because this codebase is read by
authoring agents that take it literally. Change the comment in the same edit that
changes the code; treat a stale comment like a stale test fixture.

**Functional design — separate the effect from its representation.** Real code is
effectful; the discipline is to keep the effect out of the data that describes it. A
function may be impure for performance, yet from the **consumer's view it must read as
pure**. Extract the core logic into a possibly-pure implementation that is easy to test
in isolation (also how new features should be approached — see *Implementation,
debugging and documenting behavior through tests*). Flag effects entangled with their
representation, or "pure" surfaces that quietly leak side effects.


## Documentation & how-to guides

The project is documented in the [`documentation/`](documentation/) folder.

In [`documentation/how_to/`](documentation/how_to/) you will find knowledge about:

- [`defining_grammars.md`](documentation/how_to/defining_grammars.md) — write a `defgrammar` (Ohm) that turns text into records.
- [`extracting_documents.md`](documentation/how_to/extracting_documents.md) — compose grammars into a `defextract` that produces a nested tree of records.
- [`extracting_tables.md`](documentation/how_to/extracting_tables.md) — read delimited text tables into records with a `TTable`, standalone or as a `defextract` leaf.
- [`programmatic_agent_extraction.md`](documentation/how_to/programmatic_agent_extraction.md) — the agent playbook for taking a raw PDF from zero to a working `.tsn` extractor (the two-read loop, the verify loop, design heuristics); links down to the construct how-tos above.
- [`extending_the_language.md`](documentation/how_to/extending_the_language.md) — add a new construct to the modular DSL front end, stage by stage (enums → construct module → union/registry → emit → checker).
- [`extending_lang_agent_ui.md`](documentation/how_to/extending_lang_agent_ui.md) — add a feature to the Gavagai chat UI through its event-driven functional (re-frame) architecture.
- [`mcp_server.md`](documentation/how_to/mcp_server.md) — expose the program-reasoning operations to an external agent over stdio (MCP).
- [`working_with_the_scripts.md`](documentation/how_to/working_with_the_scripts.md) — the full reference for the `scripts/` CLI adapters (`parse`/`check`/`typecheck`/`run`/`compile-schemas`/`diagram`/`pdf`), with examples and `cell=`/`@file` seeding.

> Session handoff between agents now lives in **GitHub issues** (replacing the old, gitignored
> `CLAUDE_TUNNEL.md` flat file). An automated issue-driven handoff is a planned follow-up.

## Working with the scripts

The `scripts/` directory holds thin CLI adapters over the operations in `src/operations/`, each
taking a `.tsn` file as its first argument. The everyday verify loop while authoring is:

```bash
npx tsx scripts/check.ts <file.tsn>       # parses? (syntax + grammar bodies)
npx tsx scripts/typecheck.ts <file.tsn>   # types agree across the program?
npx tsx scripts/run.ts <file.tsn> <networkName> [cell=jsExpr | cell=@file.txt ...]
```

Run them in that order (a parse error makes a type error meaningless). For the rest —
`parse`/`compile-schemas`/`diagram`/`pdf`, `cell=`/`@file` seeding, and worked examples — see
[`documentation/how_to/working_with_the_scripts.md`](documentation/how_to/working_with_the_scripts.md).
Extracting structured data from a PDF? Start with the
[extraction playbook](documentation/how_to/programmatic_agent_extraction.md).

---

## Testing

Always run the full test suite through `npm test`, not `npx jest` directly:

```bash
npm test
```

Always use `npm test`, not `npx jest` raw: the `pretest` hook typechecks src + tests first, and `npm test` runs both the CJS and ESM passes (see below). Raw `npx jest` skips both and gives a misleading picture.

`npm test` runs **two jest passes**: the default CJS pass for most tests, then an ESM pass (`npm run test:esm`, with `--experimental-vm-modules`) for tests that depend on ESM-only packages — currently anything touching `unpdf`/pdf.js, which uses `import.meta` and cannot run in jest's CJS mode. **Tests that transitively import `unpdf` must live under `tests/pdf/`** (the ESM pass's match glob); placing such a test elsewhere makes it fail to load in the CJS pass. The default pass relies on `__dirname`, so the whole suite can't simply switch to ESM.

To run a focused subset during development:

```bash
npm test -- --testPathPatterns="type-checker"
```

The script tests (`tests/scripts.test.ts`) are excluded from the default run because each test forks a subprocess and makes the suite slow. Run them explicitly when needed:

```bash
npm run test:all
```

## Non-negotiable: keep the suite clean

**All test suites and all tests must pass before every commit.** A red suite is a blocker — do not commit, do not move on to the next task.

When introducing new files or changing types, update all affected test fixtures before considering the work done. ts-jest runs in transpile-only mode and will silently accept invalid code, so it cannot be relied on to surface type errors.

`npm test` (and `npm run test:all`) now guard against this automatically: a `pretest` hook runs `npm run typecheck` first, which type-checks **both `src/` and `tests/`** under `tsconfig.test.json`. A stale fixture (e.g. one missing a newly-required `ProgramAST` field) now fails loud, pointing at the fixture line, before any test runs. Run it directly when iterating on types:

```bash
npm run typecheck   # tsc -p tsconfig.test.json --noEmit  (src + tests)
```

Note the bare `npx tsc --noEmit` checks only `src/` (the root tsconfig's `include`); use `npm run typecheck` to cover the test fixtures too.

---

## Non-negotiable: keep the agent knowledge base in sync

The containerized authoring agent ships with a **curated, hand-maintained knowledge base** (`docker/knowledge/` — a wiki baked read-only into the agent image, distinct from `documentation/`, which serves humans too). It is **not** generated from `documentation/`, so it does **not** update itself.

**Whenever you add or change a language feature** — a new construct, a changed `defgrammar`/`defextract`/`TTable` behavior, a new operation/script, a renamed verb, a new pitfall — you **must** update the agent knowledge base in the same change. A stale KB silently teaches the agent the old language. Treat it like a test fixture: the work is not done until the KB reflects the new behavior.

Concretely, when a language change lands, check and update as needed: the relevant `docker/knowledge/*.md` page(s), the distilled `language-core.md`, the bundled example `.tsn` files, and the agent's `docker/agent-home/CLAUDE.md` if the authoring loop or verify commands changed. (This is the accepted maintenance cost of hand-curation; the upside is a sharp, agent-only KB free of dev-process noise.)

---

## Test methodology

When writing or reviewing tests for a module, derive coverage from four categories:

**Capabilities** — "I can do this feature." One test per distinct behavior. If the same check runs on three input kinds, one test exercising all three is enough.

**Invariants** — "This property must hold across all inputs." Use these for constraints invisible to behavioral tests: operator rewrites, idempotency, no-op guards, ordering guarantees. A behavioral test that passes even without the invariant is not an invariant test.

**Negative tests** — Document implicit assumptions that cannot be revealed otherwise. Malformed input, conflicting state, boundary violations. The most valuable tests are the ones that would silently pass if the assumption were wrong.

**Units** — Necessary low-level tests that cannot be expressed end-to-end. Use sparingly; prefer capabilities.

## Implementation, debugging and documenting behavior through tests

When implementing something new, it is good practice to document assumptions or behaviors of other subsystems by means of dedicated tests which follow the guidelines below.
The purpose is to elicit hidden assumptions and useful knowledge that may be lost.

Whenever behavior or relevant information is not clear neither from tests nor types, it means that we are relying on some non obvious hidden assumptions. In those situations, dedicated unit and negative tests are welcome.

A good strategy for implementing a new feature is to adopt a functional perspective. A good implementation extracts the core logic into a, possibly pure, implementation that is easy to test in isolation, providing enough confidence that further integrations will succeed. In those cases, design test cases thoroughly before implementing.

## Algebraic Properties

The algebraic protocol of merge, the I function and naryUnpacking is **stable** and where the resilience of the project stands. 

As a general rule, you shall take the algebraic rules as given and **correct**. If a problem occurs it is most likely in some implementation, not in the algebra itself. 

In general, you are not supposed to edit or change algebraic properties unless the Stakeholding User **explicitly** gives you permission. 