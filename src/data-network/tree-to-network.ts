// ── THE PARSE CHOKE POINT ─────────────────────────────────────────────────────────
//
// `parseProgram` / `parseNetwork` are the program's single entry into parsing. Every
// consumer — operations, the jsgen compiler, the MCP server, Gavagai — calls one of these
// and gets back the engine's `ProgramAST` / `DataNetworkAST`.
//
// Parsing is done by the modular Ohm front end under `src/language/`: source is split into
// per-construct blocks, each parsed by its construct module, failures normalized to the
// `Syntax error at line X, col Y` shape, and the resulting node bag adapted to a ProgramAST.
//
// (The file keeps its historical name — it once walked a Lezer parse tree into the AST. That
// implementation, the generated Lezer parser, and the `.grammar` it came from were removed
// once the modular front end reached parity. Renaming the file is left as cosmetic cleanup,
// deferred to avoid churning every consumer's import path.)

import { toProgramAST } from "../language/adapter.js";
import { parseProgramStrict } from "../language/parse-strict.js";
import type { ProgramAST, DataNetworkAST } from "./types.js";

export function parseProgram(input: string): ProgramAST {
  return toProgramAST(parseProgramStrict(input));
}

export function parseNetwork(input: string): DataNetworkAST {
  const program = parseProgram(input);
  if (program.networks.length === 0) throw new Error("No defnetwork found in input");
  return program.networks[0]!;
}
