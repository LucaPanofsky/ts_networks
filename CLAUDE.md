# ts-networks — Claude Code Instructions

## How to

All scripts live in `scripts/` and are thin CLI adapters over the operations in `src/operations/`. Each takes a `.tsn` source file as its first argument.

**Parse a program and inspect the AST:**
```bash
npx tsx scripts/parse.ts <file.tsn>
```

**Check a file parses without errors:**
```bash
npx tsx scripts/check.ts <file.tsn>
```

**Type-check a file (conflicting types, unknown predicates, input mismatches):**
```bash
npx tsx scripts/typecheck.ts <file.tsn>
```

**Emit JSON Schemas for all `defrecord` types (usable as LLM structured-output schemas):**
```bash
npx tsx scripts/compile-schemas.ts <file.tsn>
```

**Run a network with seeded cell values:**
```bash
npx tsx scripts/run.ts <file.tsn> <networkName> [cell=jsExpr ...]
```

Cell values are evaluated as JavaScript expressions in the program's sandbox, so constructors and predicates defined in the program are available:
```bash
npx tsx scripts/run.ts examples/geometry.tsn rectangleMetrics 'rect={width:3,height:4}'
```

All scripts print `ok` (or a JSON result) on success and exit with code 1 on failure.

---

## Testing

Always run the full test suite through `npm test`, not `npx jest` directly:

```bash
npm test
```

`npm test` regenerates the lezer grammar parser before running jest. Running `npx jest` raw skips this step and produces false failures.

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

## Review discipline

When reviewing your work, understand the scope and the context of the change. 
Verify that the implementation respect the principles described here and that is well aligned with the rest of the codebase.

Identify small weaknesses and simple things that can be fixed easily, report to the user issues or other concerns for which you are not entitled to decide. 

## Algebraic Properties

The algebraic protocol of merge, the I function and naryUnpacking is **stable** and where the resilience of the project stands. 

As a general rule, you shall take the algebraic rules as given and **correct**. If a problem occurs it is most likely in some implementation, not in the algebra itself. 

In general, you are not supposed to edit or change algebraic properties unless the Stakeholding User **explicitly** gives you permission. 