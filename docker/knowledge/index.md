# ts-networks knowledge base — start here

You are an authoring agent. Your job: given a document and a request in `/workspace`, write
**one fitted, auditable `.tsn` program** that extracts the requested structure, verify it runs,
and leave it as the result. You are **not** writing a universal parser — see the playbook.

This wiki is everything you need. The language runtime is installed at `/app/ts-networks`
(read-only — you can read its `src/` when a page is silent, but you cannot and need not edit it).

---

## The loop, in one line

```
read the request + document  →  sketch records  →  write grammars + defextract  →
tsn-check  →  tsn-typecheck  →  tsn-run … doc=@file.txt  →  iterate  →  write /workspace/out/program.tsn
```

The three verbs are wrappers on your `PATH`:

| command | what it does |
|---|---|
| `tsn-check   <file.tsn>` | does it parse? (syntax + Ohm grammar bodies) |
| `tsn-typecheck <file.tsn>` | do records ↔ grammars ↔ verbs agree? |
| `tsn-run <file.tsn> <network> doc=@<file>.txt` | execute the network on a real document |
| `tsn-pdf <file>.pdf` | (if handed a PDF) decode it to `<file>.txt` in `/workspace` |
| `tsn-schemas <file.tsn>` | emit JSON Schemas for every `defrecord` |

`doc=@name.txt` seeds the **raw text** of `/workspace/name.txt` (read verbatim, never evaluated
as code). It is how the document gets into the network. Run the verbs **in order** — a parse
error makes a type error meaningless.

---

## Read in this order

1. **[playbook.md](playbook.md)** — the methodology: how to go from a document to a working
   extractor. The two-read model, the procedure, the design heuristics. **Read this first.**
2. **[language-core.md](language-core.md)** — the language basics: records, enums, functions,
   networks, `propagate`. The vocabulary the rest assumes.
3. **[defining-grammars.md](defining-grammars.md)** — `defgrammar`: Ohm bodies, `parse` vs
   `scan`, how a rule name becomes a captured field. The workhorse.
4. **[extracting-documents.md](extracting-documents.md)** — `defextract`: nesting records,
   `within`/`scan`/`parse`, span-scoped recursion.
5. **[extracting-tables.md](extracting-tables.md)** — `TTable`: column-aligned text tables.

Worked examples to read and imitate live under [`examples/`](examples/): a complete invoice
extractor (`examples/invoice/`), a nested GDPR article (`examples/gdpr/`), a text table
(`examples/treaty/`), and citation grammars (`examples/citations.tsn`).

---

## The deliverable (harvest contract)

When the program runs clean and produces the requested structure, write it to:

```
/workspace/out/program.tsn      ← the extractor (the artifact)
/workspace/out/recap.md         ← a short note: what it extracts, what you assumed
```

That is what gets collected when you exit. The program is the deliverable; running it is pure,
deterministic code with no model in the loop.
