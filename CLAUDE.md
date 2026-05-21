# ts-networks — Claude Code Instructions

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


