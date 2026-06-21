// block text → ParameterNode, via Ohm. The shell parses keyword, name, the `type:` clause
// (a single type predicate → a scalar TypeRef), an optional `value:` clause (opaque
// triple-quoted text), and `end`. The Ohm grammar below is the single source (there is no separate `.ohm` file).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import { IDENT_RULES } from "../../shared/grammar.js";
import type { ParameterNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Parameter {
  Main = "defparameter" ident TypeClause ValueClause? "end"
  TypeClause = "type" ":" ident ";"
  ValueClause = "value" ":" tripleString ";"
  tripleString = "\"\"\"" (~"\"\"\"" any)* "\"\"\""
  ${IDENT_RULES}
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, typeClause, valueOpt, _end) {
    const node: ParameterNode = {
      kind: ConstructKind.Parameter,
      name: name.ast() as string,
      type: { kind: "scalar", predicate: typeClause.ast() as string },
    };
    // Attach `value` only when the optional clause is present; an absent value (default =
    // Nothing) deep-equals the oracle's `value: undefined`.
    if (valueOpt.numChildren > 0) node.value = valueOpt.children[0]!.ast() as string;
    return node;
  },
  TypeClause(_type, _colon, pred, _semi) {
    return pred.ast() as string;
  },
  ValueClause(_value, _colon, ts, _semi) {
    return ts.ast() as string;
  },
  tripleString(_open, inner, _close) {
    return inner.sourceString.trim();
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseParameter(block: Block): ParameterNode {
  const m = g.match(block.text, "Main");
  if (m.failed()) {
    throw new Error(`parseParameter: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as ParameterNode;
}
