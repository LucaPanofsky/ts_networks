# UTILITIES

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