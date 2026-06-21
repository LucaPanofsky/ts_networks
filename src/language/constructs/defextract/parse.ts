// block text → ExtractNode, via Ohm. The constituency structure (one root `within` with
// nested `within`s and `scan`/`parse` binds) is parsed here; the span-based orchestration
// lives in the reused engine `compileExtract`. The Ohm grammar below is the single source (there is no separate `.ohm` file).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import { IDENT_RULES } from "../../shared/grammar.js";
import type { ExtractBind, ExtractStmt, ExtractWithin, ExtractNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Extract {
  Main = "defextract" ident Within "end"
  Within = "within" ident Using? Stmt* "end"
  Using = "using" ref
  Stmt = "scan" ident "as" ident "using" ref ";"   -- scan
       | "parse" ident "as" ident "using" ref ";"  -- parse
       | Within                                     -- within
  ref = refChar+
  refChar = alnum | "/" | "_"
  ${IDENT_RULES}
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, within, _end) {
    return {
      kind: ConstructKind.Extract,
      name: name.ast() as string,
      root: within.ast() as ExtractWithin,
    } satisfies ExtractNode;
  },
  Within(_w, target, usingOpt, stmts, _end) {
    const grammar = usingOpt.numChildren > 0 ? (usingOpt.children[0]!.ast() as string) : undefined;
    return {
      kind: "within",
      target: target.ast() as string,
      grammar,
      body: stmts.children.map((s) => s.ast() as ExtractStmt),
    } satisfies ExtractWithin;
  },
  Using(_using, ref) {
    return ref.ast() as string;
  },
  Stmt_scan(_kw, rec, _as, field, _using, ref, _semi) {
    return { kind: "scan", record: rec.ast() as string, as: field.ast() as string, grammar: ref.ast() as string } satisfies ExtractBind;
  },
  Stmt_parse(_kw, rec, _as, field, _using, ref, _semi) {
    return { kind: "parse", record: rec.ast() as string, as: field.ast() as string, grammar: ref.ast() as string } satisfies ExtractBind;
  },
  Stmt_within(within) {
    return within.ast() as ExtractWithin;
  },
  ref(_chars) {
    return this.sourceString;
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseExtract(block: Block): ExtractNode {
  const m = g.match(block.text);
  if (m.failed()) {
    throw new Error(`parseExtract: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as ExtractNode;
}
