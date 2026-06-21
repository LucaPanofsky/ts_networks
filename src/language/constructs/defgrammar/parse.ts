// block text → GrammarNode, via Ohm. The grammar SHELL (keyword, optional signature, the
// triple-quoted body, `end`) is parsed here; the body itself is opaque Ohm source captured
// verbatim and handed to the runtime (which compiles it with the reused `compileGrammar`).
// The Ohm grammar below is the single source (there is no separate `.ohm` file).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block, FnSignature } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import { IDENT_RULES, SIGNATURE_RULES, SIGNATURE_ACTIONS } from "../../shared/grammar.js";
import type { GrammarNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Grammar {
  Main = "defgrammar" ident Signature? tripleString "end"
  ${SIGNATURE_RULES}
  tripleString = "\"\"\"" (~"\"\"\"" any)* "\"\"\""
  ${IDENT_RULES}
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  ...SIGNATURE_ACTIONS,
  Main(_kw, name, sigOpt, body, _end) {
    const signature = sigOpt.numChildren > 0 ? (sigOpt.children[0]!.ast() as FnSignature) : undefined;
    return {
      kind: ConstructKind.Grammar,
      name: name.ast() as string,
      source: body.ast() as string,
      signature,
    } satisfies GrammarNode;
  },
  tripleString(_open, inner, _close) {
    return inner.sourceString.trim();
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseGrammar(block: Block): GrammarNode {
  const m = g.match(block.text);
  if (m.failed()) {
    throw new Error(`parseGrammar: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as GrammarNode;
}
