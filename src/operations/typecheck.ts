import { parseProgram } from "../data-network/tree-to-network.js";
import { typeCheckProgram } from "../data-network/type-checker.js";
import { validateGrammarSyntax, validateGrammarSignature } from "../sandbox/grammar-runtime.js";
import { validateExtract } from "../sandbox/extract-runtime.js";
import { validateTTable } from "../sandbox/ttable-runtime.js";
import { reservedFieldErrors } from "../sandbox/jsgen/compiler.js";
import type { Operation, SerializedEnrichedNetwork, SerializedError } from "./types.js";
import type { EnrichedNetwork } from "../data-network/type-checker.js";

type TypecheckInput = { source: string };
type TypecheckOutput =
  | { ok: true; networks: SerializedEnrichedNetwork[] }
  | { ok: false; error: string };

function serializeNetwork(enriched: EnrichedNetwork): SerializedEnrichedNetwork {
  const cells: SerializedEnrichedNetwork["cells"] = {};
  for (const [name, cell] of enriched.cells) {
    cells[name] = {
      writtenBy: [...cell.writtenBy],
      readBy: [...cell.readBy],
      errors: cell._errors.map((e): SerializedError => ({ kind: e.kind, message: e.message, severity: e.severity ?? "error" })),
    };
  }
  const propagators = enriched.propagators.map(p => ({
    fn: p.fn,
    from: p.from,
    to: p.to,
    errors: p._errors.map((e): SerializedError => ({ kind: e.kind, message: e.message, severity: e.severity ?? "error" })),
  }));
  return { name: enriched.name, cells, propagators };
}

export const typecheck: Operation<TypecheckInput, TypecheckOutput> = {
  name: "typecheck",
  description: "Parse and type-check a ts-networks program; return enriched network data.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code to type-check." },
    },
    required: ["source"],
  },
  handle(input) {
    try {
      const program = parseProgram(input.source);
      // Grammar bodies are opaque to the parser and the type checker. Run the structural
      // checks (as `check` does) plus the semantic signature check (the bound record must
      // exist) before type-checking. First error wins.
      for (const grammar of program.grammars) {
        const [error] = [...validateGrammarSyntax(grammar), ...validateGrammarSignature(grammar, program)];
        if (error) return { ok: false, error };
      }
      // A defextract is checked against the records and grammars it wires together
      // (cardinality, record agreement, containment). First error wins.
      for (const extract of program.extracts) {
        const [error] = validateExtract(extract, program);
        if (error) return { ok: false, error };
      }
      // A TTable is checked against its row record: headers and fields must agree.
      for (const ttable of program.ttables) {
        const [error] = validateTTable(ttable, program);
        if (error) return { ok: false, error };
      }
      // A reserved-word record field would emit invalid JS at sandbox build; reject it
      // here so the failure is an early, located diagnostic, not a cryptic SyntaxError.
      const [reservedError] = reservedFieldErrors(program);
      if (reservedError) return { ok: false, error: reservedError };
      const enrichedMap = typeCheckProgram(program);
      const networks = [...enrichedMap.values()].map(serializeNetwork);
      return { ok: true, networks };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
