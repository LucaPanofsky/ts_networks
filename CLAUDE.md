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

`npm test` regenerates the lezer grammar parser and sets `NODE_OPTIONS=--experimental-vm-modules`, which is required for the nbb sandbox tests to run. Running `npx jest` raw skips both steps and produces false failures.

To run a focused subset during development:

```bash
npm test -- --testPathPatterns="validation"
```

## Non-negotiable: keep the suite clean

**All test suites and all tests must pass before every commit.** A red suite is a blocker — do not commit, do not move on to the next task.

When introducing new files or changing types, update all affected test fixtures before considering the work done. Never rely on ts-jest to surface type errors — it runs in transpile-only mode and will silently accept invalid code. Run `tsc --noEmit` whenever types change.

```bash
npx tsc --noEmit
```


