// block text → TTableNode, via Ohm. A flat clause list (`row:` / `cell:` / `header`) folded
// into the node; the table semantics (split, column-map, validate) live in the reused engine
// `compileTTable`. The Ohm grammar below is the single source (there is no separate `.ohm` file).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { TTableHeader, TTableNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
TTable {
  Main = "TTable" ident Clause* "end"
  Clause = "row" ":" ident ";"            -- row
         | "cell" ":" string ";"          -- cell
         | "header" ident HeaderText? ";" -- header
  HeaderText = "=" string
  string = "'" (~"'" any)* "'"
  ident = letter identChar*
  identChar = alnum | "?"
}
`;

type Clause =
  | { tag: "row"; value: string }
  | { tag: "cell"; value: string }
  | { tag: "header"; header: TTableHeader };

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, clauses, _end) {
    let row = "";
    let cell = "";
    const headers: TTableHeader[] = [];
    for (const c of clauses.children) {
      const v = c.ast() as Clause;
      if (v.tag === "row") row = v.value;
      else if (v.tag === "cell") cell = v.value;
      else headers.push(v.header);
    }
    return { kind: ConstructKind.TTable, name: name.ast() as string, row, cell, headers } satisfies TTableNode;
  },
  Clause_row(_kw, _colon, rec, _semi) {
    return { tag: "row", value: rec.ast() as string } satisfies Clause;
  },
  Clause_cell(_kw, _colon, str, _semi) {
    return { tag: "cell", value: str.ast() as string } satisfies Clause;
  },
  Clause_header(_kw, field, textOpt, _semi) {
    const header: TTableHeader = { field: field.ast() as string };
    if (textOpt.numChildren > 0) header.text = textOpt.children[0]!.ast() as string;
    return { tag: "header", header } satisfies Clause;
  },
  HeaderText(_eq, str) {
    return str.ast() as string;
  },
  string(_o, chars, _c) {
    return chars.sourceString;
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseTTable(block: Block): TTableNode {
  const m = g.match(block.text);
  if (m.failed()) {
    throw new Error(`parseTTable: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as TTableNode;
}
