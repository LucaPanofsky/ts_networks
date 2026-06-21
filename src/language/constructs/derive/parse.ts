// block text → DeriveNode, via Ohm. `derive Sub from Sup;` — ends with `;`, no `end`; the
// names may carry a trailing `?` (they are predicates). The Ohm grammar below is the single source (there is no separate `.ohm` file).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import { IDENT_RULES } from "../../shared/grammar.js";
import type { DeriveNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Derive {
  Main = "derive" ident "from" ident ";"
  ${IDENT_RULES}
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, sub, _from, sup, _semi) {
    const s = sub.ast() as string;
    const p = sup.ast() as string;
    return { kind: ConstructKind.Derive, name: `${s} <: ${p}`, sub: s, sup: p } satisfies DeriveNode;
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseDerive(block: Block): DeriveNode {
  const m = g.match(block.text);
  if (m.failed()) {
    throw new Error(`parseDerive: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as DeriveNode;
}
