import { parseProgramStrict } from "../language/parse-strict.js";
import { grammarsOf } from "../language/select.js";
import { validateGrammarSyntax } from "../sandbox/grammar-runtime.js";
import type { Operation } from "./types.js";

type CheckInput = { source: string };
type CheckOutput = { ok: true } | { ok: false; error: string };

export const check: Operation<CheckInput, CheckOutput> = {
  name: "check",
  description: "Parse a ts-networks program and report any syntax errors.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code to parse." },
    },
    required: ["source"],
  },
  handle(input) {
    try {
      const program = parseProgramStrict(input.source);
      // A defgrammar's Ohm body is opaque to the parser, so its structural errors
      // (unparseable source, name mismatch) surface only here. First error wins.
      for (const grammar of grammarsOf(program)) {
        const [error] = validateGrammarSyntax(grammar);
        if (error) return { ok: false, error };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
