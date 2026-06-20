import { parseProgram } from "../data-network/tree-to-network.js";
import { recordCtorSandbox } from "../sandbox/record-sandbox.js";
import {
  compileGrammar,
  validateGrammarSyntax,
  validateGrammarSignature,
} from "../sandbox/grammar-runtime.js";
import { Contradiction } from "../info-structure.js";
import type { Operation } from "./types.js";

type RunGrammarInput = { source: string; grammar: string; input: string };

// `mode` tells the caller how to read `result`:
//   scalar     → one record (the whole string parsed)
//   scan       → an array of records (every embedded match)
//   recognizer → the matched span (a bare grammar carries no record)
type RunGrammarOutput =
  | { ok: true; mode: "scalar" | "scan" | "recognizer"; result: unknown }
  | { ok: false; kind: "parse" | "unknown-grammar" | "syntax" | "no-match"; error: string };

// Run a single named grammar against a sample string, in isolation from the rest of
// the program. This is the micro-tool for the grammar-authoring loop: the value is the
// LOCATED failure (the Ohm position, the unknown record), not a pass/fail bit. Errors
// are returned as values, never thrown — same contract as the `parse` tool.
export const runGrammar: Operation<RunGrammarInput, RunGrammarOutput> = {
  name: "run-grammar",
  description:
    "Run one named defgrammar from a ts-networks program against a sample input string. " +
    "Returns the parsed record (scalar), the scanned records (vector), or the matched span " +
    "(bare recognizer) on success; on failure, a located error (Ohm position for a no-match, " +
    "the message for a syntax/binding error). Use it to test a grammar in isolation while authoring it.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The full .tsn program source (defines the grammar and its record)." },
      grammar: { type: "string", description: "The name of the defgrammar to run." },
      input: { type: "string", description: "The sample text to run the grammar against." },
    },
    required: ["source", "grammar", "input"],
  },
  handle({ source, grammar: name, input: text }) {
    let program;
    try {
      program = parseProgram(source);
    } catch (e) {
      return { ok: false, kind: "parse", error: (e as Error).message };
    }

    const ast = program.grammars.find(g => g.name === name);
    if (!ast) {
      const known = program.grammars.map(g => g.name).join(", ") || "(none)";
      return { ok: false, kind: "unknown-grammar", error: `unknown grammar "${name}" — defined grammars: ${known}` };
    }

    // Validate JUST this grammar (syntax then signature) so the diagnostic is located
    // and tied to the named grammar, never to an unrelated one. First message wins.
    const [staticError] = [...validateGrammarSyntax(ast), ...validateGrammarSignature(ast, program)];
    if (staticError) return { ok: false, kind: "syntax", error: staticError };

    // The grammar's only sandbox use is the output record's constructor (grammar-runtime
    // `buildRecord`), so a sandbox of plain record constructors is all that's needed — and it
    // builds NO sibling grammars, so a broken sibling can't block testing this one.
    const sandbox = recordCtorSandbox(program.records);

    const mode =
      !ast.signature ? "recognizer" : ast.signature.returnType.kind === "vector" ? "scan" : "scalar";
    const result = compileGrammar(ast, program, sandbox).impl(text);

    if (result instanceof Contradiction) {
      // A whole-string parse that did not match carries the Ohm failure (with position)
      // in `reason`; anything else is a structural problem (e.g. a missing constructor).
      const reason = result.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? result.type);
      const kind = result.type === "grammar/parse-failed" ? "no-match" : "syntax";
      return { ok: false, kind, error: message };
    }
    return { ok: true, mode, result };
  },
};
