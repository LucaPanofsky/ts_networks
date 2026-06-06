import { grammar as ohmGrammar, type Grammar, type Node, type Semantics } from "ohm-js";
import type { GrammarAST, ProgramAST, RecordAST } from "../data-network/types.js";
import { Contradiction } from "../info-structure.js";
import type { Sandbox } from "./jsgen/runtime.js";

// A defgrammar compiled against the program. The impl is a *synchronous* leaf (Ohm
// matching is synchronous), so unlike network/<name> and defllmfn it returns a value
// directly — naryUnpacking's `I(...)` lifts it (a record/array/string → Something, a
// Contradiction passes through). Parse vs scan is fixed by the signature's return
// type: a scalar `to Rec?` parses the whole string, a vector `to [Rec?]` scans.
// A matched record paired with the exact substring the grammar consumed to produce
// it (Ohm's `node.sourceString`). defextract uses the span as the region for nested
// scans (span-based recursion), so a child scans only its parent's matched text.
export type ScanMatch = { record: unknown; span: string };

export type CompiledGrammar = {
  arity: number;
  impl: (...args: unknown[]) => unknown;
  // Present for scan-mode (vector) grammars only: the same matches `impl` returns,
  // but each paired with its consumed span. `impl` is exactly `scan(input).map(record)`.
  scan?: (input: unknown) => ScanMatch[];
};

const recordName = (predicate: string): string =>
  predicate.endsWith("?") ? predicate.slice(0, -1) : predicate;

// The record a signed grammar binds to: a scalar `to Rec?` names it directly, a vector
// `to [Rec?]` names its element. Bare recognizers (no signature) bind to nothing.
function signatureRecordName(ast: GrammarAST): string | null {
  const sig = ast.signature;
  if (!sig) return null;
  const ret = sig.returnType;
  return recordName(ret.kind === "vector" ? ret.element : ret.predicate);
}

// ── Static validation ─────────────────────────────────────────────────────────
//
// Every check `compileGrammar` performs below is sandbox-independent, so it can also
// run at check/typecheck time on the AST alone. These two pure validators are the
// single source of truth: `compileGrammar` calls them first (throwing the first
// message), and the check/typecheck operations call them to surface grammar errors
// statically — closing the gap where a malformed Ohm body, opaque to the parser,
// would otherwise only fail at run time.

// Structural well-formedness of the Ohm body: it parses, and the Ohm grammar's own
// name matches the defgrammar name. Returns one message per problem (empty = clean).
export function validateGrammarSyntax(ast: GrammarAST): string[] {
  let g: Grammar;
  try {
    g = ohmGrammar(ast.source);
  } catch (e) {
    return [`defgrammar ${ast.name}: invalid Ohm grammar — ${(e as Error).message}`];
  }
  if (g.name !== ast.name) {
    return [`defgrammar ${ast.name}: the Ohm grammar is named "${g.name}"; the defgrammar name and the grammar name must match`];
  }
  return [];
}

// Semantic checks against the program: a signed grammar's bound record must exist.
// (Bare recognizers carry no signature and so have nothing to check here.) Does not
// re-validate the Ohm body — that is validateGrammarSyntax's responsibility.
export function validateGrammarSignature(ast: GrammarAST, program: ProgramAST): string[] {
  const recName = signatureRecordName(ast);
  if (recName === null) return [];
  const rec = program.records.find(r => r.name === recName);
  if (!rec) {
    return [`defgrammar ${ast.name}: unknown record "${recName}" in signature`];
  }
  return [];
}

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
  // Reuse the static validators so the run-time and check-time paths report the same
  // errors. Syntax first (a broken body makes the signature check meaningless), then
  // the signature's record. ohmGrammar(ast.source) below cannot fail past this point.
  const staticErrors = [...validateGrammarSyntax(ast), ...validateGrammarSignature(ast, program)];
  if (staticErrors.length > 0) throw new Error(staticErrors[0]);

  const g = ohmGrammar(ast.source);
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
  // validateGrammarSignature already guaranteed this record exists.
  const rec = program.records.find(r => r.name === signatureRecordName(ast))!;
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
  // Each match carries its captures AND its consumed span (`node.sourceString`), so a
  // caller (defextract) can recurse into the exact text a match covered.
  type RawMatch = { caps: Record<string, unknown>; span: string };
  const sem = island.createSemantics();
  addCaptures(sem, fields);
  sem.addOperation<RawMatch[]>("scan", {
    Items(items: Node) {
      return items.children.flatMap(c => (c as unknown as { scan: () => RawMatch[] }).scan());
    },
    Item(node: Node) {
      if (node.ctorName === startRule) {
        return [{ caps: (node as unknown as { captures: () => Record<string, unknown> }).captures(), span: node.sourceString }];
      }
      return [];
    },
  });
  const scan = (input: unknown): ScanMatch[] => {
    if (typeof input !== "string") return [];
    const m = island.match(input, "Items");
    if (m.failed()) return [];
    const raw = (sem(m) as unknown as { scan: () => RawMatch[] }).scan();
    return raw.map(({ caps, span }) => ({ record: buildRecord(rec, caps, sandbox), span }));
  };
  const impl = (...args: unknown[]) => {
    const input = args[0];
    if (typeof input !== "string") return notAString();
    return scan(input).map(m => m.record);
  };
  return { arity, impl, scan };
}
