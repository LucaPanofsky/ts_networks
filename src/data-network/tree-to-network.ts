// ── parseNetwork: a program's single network ────────────────────────────────────────
//
// `parseNetwork` parses source and returns its first `defnetwork`. Parsing itself is done by
// the modular Ohm front end under `src/language/` (`parseProgramStrict`: source is split into
// per-construct blocks, each parsed by its construct module, failures normalized to the
// `Syntax error at line X, col Y` shape); `networksOf` selects the networks from the node bag.
//
// (The file keeps its historical name — it once walked a Lezer parse tree into the AST, and was
// the program's `parseProgram`/`ProgramAST` choke point until the modular `Program` became the
// single program shape end-to-end. That walker, the generated Lezer parser, the `.grammar`, the
// `Program → ProgramAST` adapter, and the `parseProgram` wrapper are all removed; renaming the
// file is left as cosmetic cleanup, deferred to avoid churning consumer import paths.)

import { parseProgramStrict } from "../language/parse-strict.js";
import { networksOf } from "../language/select.js";
import type { DataNetworkAST } from "./types.js";

export function parseNetwork(input: string): DataNetworkAST {
  const networks = networksOf(parseProgramStrict(input));
  if (networks.length === 0) throw new Error("No defnetwork found in input");
  return networks[0]!;
}
