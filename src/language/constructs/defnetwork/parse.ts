// block text → NetworkNode, via Ohm. Parses the signature + the four term kinds into a node
// that mirrors the engine's DataNetworkAST (so it deep-equals the Lezer oracle). The `as`
// coercion and the `with:` clause both fold into a propagate term's `params` map, exactly as
// the engine's collectPropagateTerm does. The grammar source below is the live copy;
// grammar.ohm is the readable canonical copy (kept in sync by hand).

import { grammar as ohmGrammar, type ActionDict } from "ohm-js";
import type { Block, Signature } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { NetworkNode, Term } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
DefNetwork {
  Main = "defnetwork" name Signature Term* "end"
  Signature = "signature" ":" "from" CellList "to" name ";"
  CellList = "[" ListOf<name, ","> "]"
  Term = Propagate | Switch | Constant | CellDecl
  Propagate = "propagate" fnRef AsClause? "from" CellList "to" name PropTail
  AsClause = "as" name
  PropTail = With   -- with
           | ";"    -- bare
  Switch = "switch" fnRef? "from" CellList "to" name ";"
  Constant = "constant" name "=" value ";"
  CellDecl = "cell" name "=" value ";"
  With = "with" ":" ListOf<ConfigPair, ","> ";"
  ConfigPair = name "=" value
  fnRef = name ("." name)*
  value = string   -- str
        | number   -- num
        | name     -- word
  string = "'" (~"'" any)* "'"
  number = digit+ ("." digit+)?
  name = nameStart nameRest*
  nameStart = letter | "_"
  nameRest = alnum | "_" | "?" | "!" | "-" | "/"
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, sig, terms, _end) {
    return {
      kind: ConstructKind.Network,
      name: name.ast() as string,
      signature: sig.ast() as Signature,
      terms: terms.children.map((t) => t.ast() as Term),
    } satisfies NetworkNode;
  },
  Signature(_sig, _colon, _from, cells, _to, toName, _semi) {
    return { from: cells.ast() as string[], to: toName.ast() as string } satisfies Signature;
  },
  CellList(_lb, list, _rb) {
    return list.asIteration().children.map((c) => c.ast() as string);
  },
  Propagate(_p, fn, asOpt, _from, cells, _to, toName, tail) {
    // params order mirrors the engine: `as` first, then the `with:` pairs merged over it.
    const params: Record<string, string> = {};
    if (asOpt.numChildren > 0) params["as"] = asOpt.children[0]!.ast() as string;
    Object.assign(params, tail.ast() as Record<string, string>);
    return {
      kind: "propagate",
      fn: fn.ast() as string,
      from: cells.ast() as string[],
      to: toName.ast() as string,
      params,
    } satisfies Term;
  },
  AsClause(_as, n) {
    return n.ast() as string;
  },
  PropTail_with(withClause) {
    return withClause.ast() as Record<string, string>;
  },
  PropTail_bare(_semi) {
    return {};
  },
  Switch(_s, fnOpt, _from, cells, _to, toName, _semi) {
    return {
      kind: "switch",
      fn: fnOpt.numChildren > 0 ? (fnOpt.children[0]!.ast() as string) : null,
      from: cells.ast() as string[],
      to: toName.ast() as string,
    } satisfies Term;
  },
  Constant(_c, name, _eq, val, _semi) {
    return { kind: "constant", name: name.ast() as string, value: val.ast() as string } satisfies Term;
  },
  CellDecl(_c, name, _eq, val, _semi) {
    return { kind: "cell", name: name.ast() as string, value: val.ast() as string } satisfies Term;
  },
  With(_with, _colon, list, _semi) {
    const pairs = list.asIteration().children.map((c) => c.ast() as [string, string]);
    return Object.fromEntries(pairs);
  },
  ConfigPair(key, _eq, val) {
    return [key.ast() as string, val.ast() as string];
  },
  fnRef(first, _dots, rest) {
    return [first.ast() as string, ...rest.children.map((c) => c.ast() as string)].join(".");
  },
  // String values lose their quotes (matching the engine's collectValueTerm / collectParams);
  // numbers and barewords (incl. true/false) are kept verbatim.
  value_str(s) {
    return s.ast() as string;
  },
  value_num(n) {
    return n.sourceString;
  },
  value_word(id) {
    return id.ast() as string;
  },
  string(_open, inner, _close) {
    return inner.sourceString;
  },
  name(_start, _rest) {
    return this.sourceString;
  },
} as ActionDict<unknown>);

export function parseNetwork(block: Block): NetworkNode {
  const m = g.match(block.text, "Main");
  if (m.failed()) {
    throw new Error(`parseNetwork: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as NetworkNode;
}
