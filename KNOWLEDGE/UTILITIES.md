# UTILITIES

All scripts live in `scripts/` and are thin CLI adapters over the operations in `src/operations/`.
Each script reads a `.tsn` source file, calls the corresponding operation, and prints the result to stdout.
On failure, all scripts print an error message and exit with code 1.

---

## PARSE

Emit the full `ProgramAST` as JSON. Useful for debugging the parser, feeding into external tooling,
or providing an LLM with an unambiguous machine-readable specification of the program.

```bash
npx tsx scripts/parse.ts <file.tsn>
```

Example:

```bash
npx tsx scripts/parse.ts examples/geometry.tsn | jq '.networks[0].name'
# "geometry"
```

---

## CHECK

Check whether a `.tsn` file parses without errors.

```bash
npx tsx scripts/check.ts <file.tsn>
```

Prints `ok` on success.

Example:

```bash
npx tsx scripts/check.ts examples/search.tsn
# ok
```

---

## TYPECHECK

Check whether a `.tsn` file is well-typed — no conflicting cell types, unknown predicates, or input mismatches.

```bash
npx tsx scripts/typecheck.ts <file.tsn>
```

Prints `ok` on success. On failure, prints structured errors grouped by network and node.

Example:

```bash
npx tsx scripts/typecheck.ts examples/agentic_network_document_analysis_example.tsn
# ok
```

---

## COMPILE-SCHEMAS

Emit a JSON Schema object for every `defrecord` in the program. The output is suitable for use as
a structured-output schema with LLM APIs (Anthropic, OpenAI) or for data validation with tools like `ajv`.

```bash
npx tsx scripts/compile-schemas.ts <file.tsn>
```

Example:

```bash
npx tsx scripts/compile-schemas.ts examples/agentic_network_document_analysis_example.tsn
# {
#   "DocumentAnalysis": {
#     "type": "object",
#     "properties": { ... },
#     "required": [...]
#   }
# }
```

---

## RUN

Compile and execute a network with given cell inputs.

```bash
npx tsx scripts/run.ts <file.tsn> <network> [cell=expr ...]
```

Cell values are evaluated as JavaScript expressions in the program's sandbox (so predicates and
record constructors are available).

Example:

```bash
npx tsx scripts/run.ts examples/geometry.tsn rectangleMetrics 'rect={width:3,height:4}'
# rect = {"width":3,"height":4}
# area = 12
```
