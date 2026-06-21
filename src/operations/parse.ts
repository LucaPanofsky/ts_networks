import { parseProgramStrict } from "../language/parse-strict.js";
import type { Program } from "../language/pipeline/program.js";
import type { Operation } from "./types.js";

type ParseInput = { source: string };
// The modular program shape: a flat `{ nodes }` bag (each node tagged by `kind`). This is
// the single program representation now that the engine's grouped `ProgramAST` is gone.
type ParseOutput = { ok: true; ast: Program } | { ok: false; error: string };

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
      return { ok: true, ast: parseProgramStrict(input.source) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
