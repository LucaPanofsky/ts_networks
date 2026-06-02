import { grammar as ohmGrammar, type Grammar, type Node, type Semantics } from "ohm-js";
import type { GrammarAST, ProgramAST, RecordAST } from "../data-network/types.js";
import { Contradiction } from "../info-structure.js";
import type { Sandbox } from "./jsgen/runtime.js";

// A defgrammar compiled against the program. The impl is a *synchronous* leaf (Ohm
// matching is synchronous), so unlike network/<name> and defllmfn it returns a value
// directly — naryUnpacking's `I(...)` lifts it (a record/array/string → Something, a
// Contradiction passes through). Parse vs scan is fixed by the signature's return
// type: a scalar `to Rec?` parses the whole string, a vector `to [Rec?]` scans.
export type CompiledGrammar = {
  arity: number;
  impl: (...args: unknown[]) => unknown;
};

const recordName = (predicate: string): string =>
  predicate.endsWith("?") ? predicate.slice(0, -1) : predicate;

const notAString = () => new Contradiction("grammar/not-a-string", new Set());

// A capture is the text every CST node whose rule name is a target field consumed.
// Repeated applications of the same field rule accumulate into an array. This is one
// generic operation that works for any grammar — no per-grammar action code.
function addCaptures(sem: Semantics, fields: Set<string>): void {
  const merge = (children: Node[]): Record<string, unknown> => {
    const acc: Record<string, unknown> = {};
    for (const c of children) {
      const sub = (c as unknown as { captures: () => Record<string, unknown> }).captures();
      for (const k of Object.keys(sub)) {
        acc[k] = k in acc ? ([] as unknown[]).concat(acc[k], sub[k]) : sub[k];
      }
    }
    return acc;
  };
  sem.addOperation<Record<string, unknown>>("captures", {
    _terminal() { return {}; },
    _iter(...children: Node[]) { return merge(children); },
    _nonterminal(...children: Node[]) {
      const acc = merge(children);
      if (fields.has(this.ctorName)) acc[this.ctorName] = this.sourceString;
      return acc;
    },
  });
}

// Build a record from captured fields. A vector field becomes an array (empty if the
// rule never matched); a scalar field takes the lone capture (or the first, if a rule
// happened to match more than once).
function buildRecord(rec: RecordAST, caps: Record<string, unknown>, sandbox: Sandbox): unknown {
  const ctor = sandbox[rec.name];
  if (typeof ctor !== "function") {
    return new Contradiction("grammar/unknown-record", new Set(), new Error(`record "${rec.name}" not in sandbox`));
  }
  const args = rec.fields.map(f => {
    const v = caps[f.name];
    if (f.type.kind === "vector") return v === undefined ? [] : ([] as unknown[]).concat(v);
    return Array.isArray(v) ? v[0] : v;
  });
  return ctor(...args);
}

export function compileGrammar(ast: GrammarAST, program: ProgramAST, sandbox: Sandbox): CompiledGrammar {
  let g: Grammar;
  try {
    g = ohmGrammar(ast.source);
  } catch (e) {
    throw new Error(`defgrammar ${ast.name}: invalid Ohm grammar — ${(e as Error).message}`);
  }
  if (g.name !== ast.name) {
    throw new Error(`defgrammar ${ast.name}: the Ohm grammar is named "${g.name}"; the defgrammar name and the grammar name must match`);
  }

  const sig = ast.signature;
  const arity = sig?.params.length ?? 1;

  // No signature → bare recognizer: whole-string match, returning the matched text.
  if (!sig) {
    const impl = (...args: unknown[]) => {
      const input = args[0];
      if (typeof input !== "string") return notAString();
      const m = g.match(input);
      if (m.failed()) return new Contradiction("grammar/parse-failed", new Set(), new Error(m.message));
      return input; // a whole-string parse consumed all of the input
    };
    return { arity, impl };
  }

  const isScan = sig.returnType.kind === "vector";
  const recName = recordName(sig.returnType.kind === "vector" ? sig.returnType.element : sig.returnType.predicate);
  const rec = program.records.find(r => r.name === recName);
  if (!rec) {
    throw new Error(`defgrammar ${ast.name}: unknown record "${recName}" in signature`);
  }
  const fields = new Set(rec.fields.map(f => f.name));

  // Scalar return → parse the whole string into one record (Contradiction on failure).
  if (!isScan) {
    const sem = g.createSemantics();
    addCaptures(sem, fields);
    const impl = (...args: unknown[]) => {
      const input = args[0];
      if (typeof input !== "string") return notAString();
      const m = g.match(input);
      if (m.failed()) return new Contradiction("grammar/parse-failed", new Set(), new Error(m.message));
      const caps = (sem(m) as unknown as { captures: () => Record<string, unknown> }).captures();
      return buildRecord(rec, caps, sandbox);
    };
    return { arity, impl };
  }

  // Vector return → island scan: synthesize a supergrammar that walks the input and
  // collects every embedded match of the user grammar's start rule. `Item = start | any`
  // tries the start rule at each position and otherwise consumes one character, so the
  // scan finds all non-overlapping matches left to right. It never fails (`Item*` matches
  // the empty string), so zero matches is an empty array, not a Contradiction.
  const startRule = (g as unknown as { defaultStartRule?: string }).defaultStartRule ?? Object.keys(g.rules)[0]!;
  const islandSrc = `Island <: ${g.name} {\n  Items = Item*\n  Item = ${startRule} | any\n}`;
  let island: Grammar;
  try {
    island = ohmGrammar(islandSrc, { [g.name]: g });
  } catch (e) {
    throw new Error(`defgrammar ${ast.name}: could not build island scanner — ${(e as Error).message}`);
  }
  const sem = island.createSemantics();
  addCaptures(sem, fields);
  sem.addOperation<Array<Record<string, unknown>>>("scan", {
    Items(items: Node) {
      return items.children.flatMap(c => (c as unknown as { scan: () => Array<Record<string, unknown>> }).scan());
    },
    Item(node: Node) {
      if (node.ctorName === startRule) return [(node as unknown as { captures: () => Record<string, unknown> }).captures()];
      return [];
    },
  });
  const impl = (...args: unknown[]) => {
    const input = args[0];
    if (typeof input !== "string") return notAString();
    const m = island.match(input, "Items");
    if (m.failed()) return [];
    const capsList = (sem(m) as unknown as { scan: () => Array<Record<string, unknown>> }).scan();
    return capsList.map(caps => buildRecord(rec, caps, sandbox));
  };
  return { arity, impl };
}
