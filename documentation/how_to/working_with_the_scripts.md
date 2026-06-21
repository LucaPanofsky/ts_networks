# How to: working with the scripts

All scripts live in `scripts/` and are thin CLI adapters over the operations in `src/operations/`.
Each takes a `.tsn` source file as its first argument. They all print `ok` (or a JSON result) on
success and exit with code `1` on failure.

The everyday verify loop while authoring is **`check` → `typecheck` → `run`** (a parse error makes
a type error meaningless, so run them in that order).

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
npx tsx scripts/run.ts repo_workspace/examples/geometry.tsn rectangleMetrics 'rect={width:3,height:4}'
```

Alternatively, `cell=@filename` seeds the **raw text** of a file from the `WORKSPACE/` directory (read verbatim as a string, *not* evaluated as JS) — the way to feed a real document (e.g. the `.txt` produced by `pdf-to-text`) into a network:
```bash
npx tsx scripts/run.ts extract.tsn extractInvoice doc=@example_invoice.txt
```

## Compile once, run anywhere

`run` compiles the source fresh on every call. To compile **once** to a self-contained JavaScript
artifact and run it repeatedly, use `compile-js`:
```bash
npx tsx scripts/compile-js.ts <file.tsn> [out.js]   # write to out.js, or print to stdout
```
The artifact is one ESM module that imports only `@tsn/runtime`, builds the program's registry, and
carries a `__manifest` of its networks. There are two ways to run it, with the **same** cell-seeding
as `run` (`name=jsExpr` or `name=@file`):

- **In-process (daily use, no build):** read the artifact and run it through the live runtime —
  ```bash
  npx tsx scripts/run-compiled.ts <artifact.js> <networkName> [cell=jsExpr ...]
  ```
  This injects the in-memory runtime, so it needs no build and works on any path.

- **Plain `node` (compile-once/run-anywhere):** execute the artifact as a real module against the
  **built** runtime —
  ```bash
  npm run build                                       # produce dist/ (so @tsn/runtime resolves)
  node dist/operations/run-artifact.js <artifact> <networkName> [cell=jsExpr ...]
  # or: npm run run-artifact -- <artifact> <networkName> [cell=jsExpr ...]
  ```
  Two caveats, both from real module resolution: (1) **run it with `node`, not `tsx`** — the runner
  and the artifact must share the one built runtime instance, or every cell projects to `null`;
  (2) the artifact must sit **inside the repo tree** (or any directory whose ancestors contain
  `node_modules/@tsn/runtime`) so its `import "@tsn/runtime"` resolves, and use a `.mjs` extension
  if written outside a `"type":"module"` package. Out-of-tree distribution awaits a published runtime.

- **Compile-and-run a `.tsn` in one step, under `node`:** the built equivalent of `scripts/run.ts`
  (which runs via `tsx`) — start from source, no `.mjs`, no temp file (it compiles in memory) —
  ```bash
  npm run build
  node dist/operations/run-source.js <file.tsn> <networkName> [cell=jsExpr ...]
  # or: npm run run-tsn -- <file.tsn> <networkName> [cell=jsExpr ...]
  ```

**Render a network as a Mermaid diagram (cells, operations, switch cond/value labels, explicit recursion):**
```bash
npx tsx scripts/diagram.ts <file.tsn> [networkName] [live]
```

`networkName` is optional when the program defines exactly one network. Pass the literal word `live` to get a `mermaid.live` editor link instead of the raw diagram string. Only requires the source to *parse* (and contain the network) — it reads structure, not types, so the referenced functions need not be defined:
```bash
npx tsx scripts/diagram.ts repo_workspace/examples/search.tsn live
```

**Extract text from a PDF in the workspace:**
```bash
npx tsx scripts/pdf.ts <file.pdf>
```

Reads `<file.pdf>` from the `WORKSPACE/` directory, decodes it to text, and writes `<file>.txt` alongside it (pages separated by `--- page N ---`). Set `TSN_WORKSPACE` to point at a different workspace root. Unlike the other scripts, the argument is a PDF filename *in the workspace*, not a `.tsn` source file. Also available as the `pdf-to-text` MCP tool.

> **Extracting structured data from a PDF?** Start with the playbook in
> [`programmatic_agent_extraction.md`](programmatic_agent_extraction.md) — it takes a raw PDF
> request from zero to a working `.tsn` extractor and links down to the construct-level how-tos.
