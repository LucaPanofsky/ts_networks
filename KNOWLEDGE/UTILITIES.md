# UTILITIES

## TYPE CHECKING NETWORKS

Check whether a `.tsn` file is well-typed (no conflicting types, unknown predicates, or input mismatches):

```bash
npx tsx scripts/typecheck.ts <file.tsn>
```

Prints `ok` on success. On failure, prints structured errors grouped by network and node, and exits with code 1.

Example:

```bash
npx tsx scripts/typecheck.ts examples/agentic_network_document_analysis_example.tsn
# ok
```

## VALIDATING NETWORKS

Check whether a `.tsn` DSL file parses correctly:

```bash
npx tsx scripts/check.ts <file.tsn>
```

Prints `ok` on success. Prints the parse error message and exits with code 1 on failure.

Example:

```bash
npx tsx scripts/check.ts examples/search.tsn
# ok
```