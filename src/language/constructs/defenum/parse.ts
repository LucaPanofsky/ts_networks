// block text → EnumNode, via Ohm. A comma-separated list of single-quoted values, then `;`
// and `end`. The grammar source below is the live copy; grammar.ohm is the readable
// canonical copy (kept in sync by hand — .ohm files are not importable under NodeNext/jest).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { EnumNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Enum {
  Main = "defenum" ident string ("," string)* ";" "end"
  string = "'" (~"'" any)* "'"
  ident = letter identChar*
  identChar = alnum | "?"
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
