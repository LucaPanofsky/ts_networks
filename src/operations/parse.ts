import { parseProgram } from "../data-network/tree-to-network.js";
import type { ProgramAST } from "../data-network/types.js";
import type { Operation } from "./types.js";

type ParseInput = { source: string };
type ParseOutput = { ok: true; ast: ProgramAST } | { ok: false; error: string };

export const parse: Operation<ParseInput, ParseOutput> = {
  name: "parse",
  description: "Parse a ts-networks program and return the full AST as a plain JSON object.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code to parse." },
    },
    required: ["source"],
  },
  handle(input) {
    try {
      return { ok: true, ast: parseProgram(input.source) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
