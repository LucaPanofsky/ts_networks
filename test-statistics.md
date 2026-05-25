# Test Suite Statistics

Generated: 2026-05-25  
Total test files: 38 | Total test cases: ~662

---

## All files, sorted by test count

| Tests | Suites | File |
|------:|-------:|------|
|  91 | 22 | `tests/data-network/parse-program.test.ts` |
|  51 | 23 | `tests/scripts.test.ts` |
|  49 | 14 | `tests/sandbox/jsgen/compiler.test.ts` |
|  40 |  7 | `tests/sandbox/jsgen/expressions.test.ts` |
|  36 | 10 | `tests/data-network/schema.test.ts` |
|  26 |  7 | `tests/information-structures/merge-object.test.ts` |
|  26 | 10 | `tests/data-network/type-checker.test.ts` |
|  25 |  8 | `tests/data-network/parser.test.ts` |
|  22 |  7 | `tests/network-impl/apromise.test.ts` |
|  18 |  4 | `tests/sandbox/jsgen/registry.test.ts` |
|  17 |  5 | `tests/sandbox/jsgen/networks.test.ts` |
|  15 |  3 | `tests/data-network/hierarchy.test.ts` |
|  13 |  2 | `tests/validation/checks/arities.test.ts` |
|  13 |  1 | `tests/sandbox/jsgen/runtime.test.ts` |
|  13 |  1 | `tests/data-network/ast-to-data-network.test.ts` |
|  12 |  3 | `tests/data-network/data-network.test.ts` |
|  11 |  5 | `tests/network-impl/cell.test.ts` |
|  11 |  4 | `tests/nary-unpacking.test.ts` |
|   9 |  2 | `tests/validation/checks/topology.test.ts` |
|   9 |  2 | `tests/validation/checks/references.test.ts` |
|   8 |  0 | `tests/ui-server/mermaid.test.ts` |
|   7 |  1 | `tests/sandbox/jsgen/compile.test.ts` |
|   7 |  0 | `tests/ui-server/repl-parser.test.ts` |
|   6 |  3 | `tests/registry.test.ts` |
|   6 |  1 | `tests/sandbox/jsgen/agent.test.ts` |
|   6 |  1 | `tests/network-impl/equations.test.ts` |
|   6 |  0 | `tests/ui-server/run-handler.test.ts` |
|   5 |  4 | `tests/data-network/ranking.test.ts` |
|   5 |  3 | `tests/network-impl/runner.test.ts` |
|   5 |  2 | `tests/network-impl/deferred.test.ts` |
|   5 |  1 | `tests/sandbox/jsgen/match.test.ts` |
|   4 |  1 | `tests/network-impl/propagator.test.ts` |
|   3 |  3 | `tests/algebraic-properties-1.test.ts` |
|   3 |  1 | `tests/sandbox/jsgen/async-runner.test.ts` |
|   3 |  1 | `tests/i-idempotent.test.ts` |
|   2 |  1 | `tests/sandbox/jsgen/recursive.test.ts` |
|   2 |  1 | `tests/network-impl/async-network.test.ts` |
|   1 |  1 | `tests/network-impl/reader.test.ts` |

---

## By module group

| Group | Files | Tests | % of total |
|-------|------:|------:|-----------:|
| `data-network/` | 8 | 240 | 36% |
| `sandbox/jsgen/` | 10 | 156 | 24% |
| `network-impl/` | 8 | 66 | 10% |
| `scripts` (integration) | 1 | 51 | 8% |
| `validation/` | 3 | 31 | 5% |
| `information-structures/` | 1 | 26 | 4% |
| `ui-server/` | 3 | 21 | 3% |
| top-level misc | 4 | 17 | 3% |

---

## Observations

**`data-network/` dominates (36%).**
The largest single file is `parse-program.test.ts` (91 tests across 22 suites).
This file exercises the full parse-then-build pipeline with a large number of fixture programs.

**`scripts.test.ts` is the CI bottleneck.**
51 tests, each of which forks a `npx tsx` subprocess to invoke a CLI script.
Process-spawn overhead accumulates and is the likely reason the suite feels slow.
The actual logic being tested is already covered by unit tests elsewhere.

**`sandbox/jsgen/compiler.test.ts` has redundancy.**
49 low-level codegen snapshot tests. Much of the same ground is covered end-to-end by
`expressions.test.ts` (40 tests) and `match.test.ts` (5 tests), which compile and *execute* real output.

**`network-impl/apromise.test.ts` is the largest network-impl file (22 tests).**
Larger than all other `network-impl/` files combined. May warrant review.
