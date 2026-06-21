// The expression sub-language, parsed with Ohm into the EXISTING `Expr` AST
// (`src/data-network/types.ts`) so the existing `compileExpr` can be reused verbatim.
// The `Expr` AST is the contract: we swap the front end (Lezer → Ohm) and keep the
// back end. The grammar string below is the single source (there is no separate `.ohm` file).
//
// Precedence (high→low, replicating the Lezer grammar): field `.` › unary `! -` › `* /`
// › `+ -` › comparison › `&&` › `||`. All binary operators are left-associative; encoded
// here via iteration `Level = Next (op Next)*` folded left-to-right (no left recursion).

import { grammar as ohmGrammar, type Node, type ActionDict } from "ohm-js";
import type { Expr, MatchArm, LetBinding } from "../../data-network/types.js";

const GRAMMAR_SOURCE = String.raw`
TsnExpr {
  ExprBody = LetBinding* Exp ";"
  LetBinding = "let" ident "=" Exp ";"

  Exp     = AndExp (orOp AndExp)*
  AndExp  = CmpExp (andOp CmpExp)*
  CmpExp  = AddExp (cmpOp AddExp)*
  AddExp  = MulExp (addOp MulExp)*
  MulExp  = UnaryExp (mulOp UnaryExp)*
  UnaryExp = unaryOp* PostfixExp
  PostfixExp = Primary ("." ident)*

  Primary
    = "(" Exp ")"  -- paren
    | MatchExp     -- match
    | Call         -- call
    | number       -- num
    | string       -- str
    | boolean      -- bool
    | ident        -- var

  Call = ident "(" ListOf<Exp, ","> ")"

  MatchExp = "match" Exp MatchArm+ "end"
  MatchArm = "|" Pattern Guard? "->" Exp
  Guard = "when" Exp
  Pattern = RecordPattern -- rec
          | ident         -- wild
  RecordPattern = ident "{" ListOf<FieldBinding, ","> "}"
  FieldBinding = ident ":" ident

  orOp = "||"
  andOp = "&&"
  cmpOp = "==" | "!=" | "<=" | ">=" | "<" | ">"
  addOp = "+" | "-"
  mulOp = "*" | "/"
  unaryOp = "!" | "-"

  number = digit+ ("." digit+)?
  string = "'" (~"'" any)* "'"
  boolean = ("true" | "false") ~nameCont

  ident = ~keyword name
  name = nameStart nameCont*
  nameStart = letter | "_"
  nameCont = alnum | "_" | "?" | "!" | "-" | "/"
  keyword = ("match" | "let" | "when" | "end" | "true" | "false") ~nameCont

  comment = "//" (~"\n" any)*
  space += comment
}
`;

// The grammar is exported so the `defn` shell grammar can inherit it (`TsnDefn <:
// TsnExpr`) and reuse these very actions for the body.
export const exprGrammar = ohmGrammar(GRAMMAR_SOURCE);

// Fold a left-associative binary level: first (op rhs)* → nested BinaryExpr.
function foldBinary(first: Node, ops: Node, rests: Node): Expr {
  let node = first.ast() as Expr;
  const opNodes = ops.children;
  const restNodes = rests.children;
  for (let i = 0; i < opNodes.length; i++) {
    node = { kind: "binary", op: opNodes[i]!.sourceString, left: node, right: restNodes[i]!.ast() as Expr };
  }
  return node;
}

// Exported so `defn`'s semantics can spread these in (inherited rules need their
// actions). The `ast` operation builds the existing `Expr` AST.
export const EXPR_ACTIONS: ActionDict<unknown> = {
  ExprBody(letIter, exp, _semi) {
    const bindings = letIter.children.map((c) => c.ast() as LetBinding);
    const body = exp.ast() as Expr;
    return bindings.length ? { kind: "let", bindings, body } : body;
  },
  LetBinding(_let, id, _eq, exp, _semi) {
    return { name: id.ast() as string, value: exp.ast() as Expr } satisfies LetBinding;
  },

  Exp(first, ops, rests) { return foldBinary(first, ops, rests); },
  AndExp(first, ops, rests) { return foldBinary(first, ops, rests); },
  CmpExp(first, ops, rests) { return foldBinary(first, ops, rests); },
  AddExp(first, ops, rests) { return foldBinary(first, ops, rests); },
  MulExp(first, ops, rests) { return foldBinary(first, ops, rests); },

  UnaryExp(opIter, postfix) {
    let node = postfix.ast() as Expr;
    const ops = opIter.children;
    for (let i = ops.length - 1; i >= 0; i--) {
      node = { kind: "unary", op: ops[i]!.sourceString, expr: node };
    }
    return node;
  },

  PostfixExp(primary, _dots, idents) {
    let node = primary.ast() as Expr;
    for (const id of idents.children) {
      node = { kind: "field", object: node, field: id.ast() as string };
    }
    return node;
  },

  Primary_paren(_l, e, _r) { return e.ast(); },
  Primary_match(m) { return m.ast(); },
  Primary_call(c) { return c.ast(); },
  Primary_num(n) { return n.ast(); },
  Primary_str(s) { return s.ast(); },
  Primary_bool(b) { return b.ast(); },
  Primary_var(id) { return { kind: "var", name: id.ast() as string }; },

  Call(id, _l, list, _r) {
    return {
      kind: "call",
      fn: id.ast() as string,
      args: list.asIteration().children.map((c) => c.ast() as Expr),
    };
  },

  MatchExp(_match, subject, arms, _end) {
    return {
      kind: "match",
      subject: subject.ast() as Expr,
      arms: arms.children.map((a) => a.ast() as MatchArm),
    };
  },
  MatchArm(_pipe, pat, guardOpt, _arrow, body) {
    const guard = guardOpt.numChildren > 0 ? (guardOpt.children[0]!.ast() as Expr) : null;
    return { pattern: pat.ast(), guard, body: body.ast() } as MatchArm;
  },
  Guard(_when, exp) { return exp.ast(); },
  Pattern_rec(rp) { return rp.ast(); },
  Pattern_wild(_id) { return { kind: "wildcard" }; },
  RecordPattern(name, _lb, list, _rb) {
    return {
      kind: "record-pattern",
      recordName: name.ast() as string,
      bindings: list.asIteration().children.map((c) => c.ast() as { field: string; as: string }),
    };
  },
  FieldBinding(field, _colon, as) {
    return { field: field.ast() as string, as: as.ast() as string };
  },

  number(_int, _dot, _frac) { return { kind: "literal", value: Number(this.sourceString) }; },
  string(_o, chars, _c) { return { kind: "literal", value: chars.sourceString }; },
  boolean(_w) { return { kind: "literal", value: this.sourceString === "true" }; },
  ident(_n) { return this.sourceString; },
};

const semantics = exprGrammar.createSemantics().addOperation<unknown>("ast", EXPR_ACTIONS);

export function parseExpression(text: string): Expr {
  const m = exprGrammar.match(text, "ExprBody");
  if (m.failed()) {
    throw new Error(`parseExpression: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as Expr;
}
