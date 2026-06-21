// block text → EnumNode, via Ohm. A comma-separated list of single-quoted values, then `;`
// and `end`. The Ohm grammar below is the single source (there is no separate `.ohm` file).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import { IDENT_RULES } from "../../shared/grammar.js";
import type { EnumNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Enum {
  Main = "defenum" ident string ("," string)* ";" "end"
  string = "'" (~"'" any)* "'"
  ${IDENT_RULES}
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, first, _commas, rest, _semi, _end) {
    const values = [first.ast() as string, ...rest.children.map((c) => c.ast() as string)];
    return { kind: ConstructKind.Enum, name: name.ast() as string, values } satisfies EnumNode;
  },
  string(_o, chars, _c) {
    return chars.sourceString;
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseEnum(block: Block): EnumNode {
  const m = g.match(block.text);
  if (m.failed()) {
    throw new Error(`parseEnum: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as EnumNode;
}
