import { parseProgram } from "../data-network/tree-to-network.js";
import { createSandbox } from "../sandbox/jsgen/runtime.js";
import { compileTTable, validateTTable } from "../sandbox/ttable-runtime.js";
import { Contradiction } from "../info-structure.js";
import type { Operation } from "./types.js";

type RunTTableInput = { source: string; ttable: string; input: string };

// A TTable always yields an array of rows. A `rows` element is either a record or, for
// a malformed row (cell count ≠ header), a serialized per-row contradiction — the
// table's self-validation, surfaced as a value rather than a whole-table failure.
type RunTTableOutput =
  | { ok: true; rows: unknown[] }
  | { ok: false; kind: "parse" | "unknown-ttable" | "syntax" | "no-match"; error: string };

const reasonMessage = (c: Contradiction): string =>
  c.reason instanceof Error ? c.reason.message : String(c.reason ?? c.type);

// Run a single named TTable against a sample string, in isolation from the rest of the
// program. The tabular twin of run-grammar: the value is the LOCATED outcome — which
// rows parsed, which were malformed (and why), or why no header matched. Errors are
// returned as values, never thrown.
export const runTtable: Operation<RunTTableInput, RunTTableOutput> = {
  name: "run-ttable",
  description:
    "Run one named TTable from a ts-networks program against a sample input string. " +
    "Returns the parsed rows on success (a malformed row appears as a per-row " +
    "{ __contradiction, reason }); on failure, a located error (a header that did not " +
    "match the input, an unknown record/field, etc.). Use it to test a text-table " +
    "extractor in isolation while authoring it.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The full .tsn program source (defines the TTable and its row record)." },
      ttable: { type: "string", description: "The name of the TTable to run." },
      input: { type: "string", description: "The sample table text to run the TTable against." },
    },
    required: ["source", "ttable", "input"],
  },
  handle({ source, ttable: name, input: text }) {
    let program;
    try {
      program = parseProgram(source);
    } catch (e) {
      return { ok: false, kind: "parse", error: (e as Error).message };
    }

    const ast = program.ttables.find(t => t.name === name);
    if (!ast) {
      const known = program.ttables.map(t => t.name).join(", ") || "(none)";
      return { ok: false, kind: "unknown-ttable", error: `unknown ttable "${name}" — defined ttables: ${known}` };
    }

    // Validate JUST this table (record exists, headers/fields agree) so the diagnostic
    // is located and tied to the named table. First message wins.
    const [staticError] = validateTTable(ast, program);
    if (staticError) return { ok: false, kind: "syntax", error: staticError };

    // Strip grammars before building the sandbox: a TTable needs none, and createSandbox
    // compiles every grammar eagerly and throws on the first bad body — so an unrelated
    // broken grammar in the program must not block testing this table. Records are kept.
    let sandbox;
    try {
      sandbox = createSandbox({ ...program, grammars: [] });
    } catch (e) {
      return { ok: false, kind: "syntax", error: (e as Error).message };
    }

    const result = compileTTable(ast, program, sandbox).impl(text);

    // A table-level Contradiction means the input did not fit the table shape (no header
    // line, or a declared header absent from it) or a structural problem (missing record).
    if (result instanceof Contradiction) {
      const kind = result.type === "ttable/no-header" || result.type === "ttable/header-mismatch" ? "no-match" : "syntax";
      return { ok: false, kind, error: reasonMessage(result) };
    }

    // Otherwise an array of rows: each is a record, or a serialized per-row contradiction.
    const rows = (result as unknown[]).map(row =>
      row instanceof Contradiction ? { __contradiction: row.type, reason: reasonMessage(row) } : row,
    );
    return { ok: true, rows };
  },
};
