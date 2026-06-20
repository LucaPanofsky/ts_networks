import type { ExtractAST, ExtractWithin, ExtractStmt, TypeRef } from "../data-network/types.js";
import type { Program } from "../language/pipeline/program.js";
import { recordsOf, grammarsOf, ttablesOf } from "../language/select.js";
import type { ScanMatch } from "./grammar-runtime.js";
import { Contradiction } from "../info-structure.js";

// ── Static validation (type-check rules) ──────────────────────────────────────

const stripPred = (s: string): string => (s.endsWith("?") ? s.slice(0, -1) : s);

// The record a field holds: a vector's element or a scalar predicate, ?-stripped.
const fieldRecord = (t: TypeRef): string => stripPred(t.kind === "vector" ? t.element : t.predicate);

// The record a grammar produces, or null if the grammar is unknown or unsigned (a bare
// recognizer returns text, not a record, so it cannot back a scan/parse bind).
function grammarReturnRecord(ref: string, program: Program): string | null {
  const name = ref.startsWith("grammar/") ? ref.slice("grammar/".length) : ref;
  const g = grammarsOf(program).find(x => x.name === name);
  if (!g?.signature) return null;
  const rt = g.signature.returnType;
  return stripPred(rt.kind === "vector" ? rt.element : rt.predicate);
}

// Type-check a defextract against the program's records and grammars (design Q3). All
// checks are LOCAL and decidable; the rest of the program's type-checking is unchanged.
// Returns one message per problem (empty = clean):
//   - `scan` fills a VECTOR field, `parse` a SCALAR field;
//   - the bind's element record == the field's element record == the grammar's return;
//   - a nested `within f` targets a vector-of-record field, then recurses into its element;
//   - the root grammar returns the root record.
export function validateExtract(ast: ExtractAST, program: Program): string[] {
  const errors: string[] = [];
  const recordByName = new Map(recordsOf(program).map(r => [r.name, r] as const));
  const here = `defextract ${ast.name}`;

  const checkScope = (within: ExtractWithin, recordName: string): void => {
    const rec = recordByName.get(recordName);
    if (!rec) { errors.push(`${here}: unknown record "${recordName}"`); return; }
    for (const stmt of within.body) {
      if (stmt.kind === "within") {
        const field = rec.fields.find(f => f.name === stmt.target);
        if (!field) { errors.push(`${here}: "within ${stmt.target}" — no field "${stmt.target}" on ${recordName}`); continue; }
        if (field.type.kind !== "vector") { errors.push(`${here}: "within ${stmt.target}" must target a vector field, but "${stmt.target}" on ${recordName} is scalar`); continue; }
        const elem = stripPred(field.type.element);
        if (!recordByName.has(elem)) { errors.push(`${here}: "within ${stmt.target}" element "${elem}" is not a record`); continue; }
        checkScope(stmt, elem);
      } else {
        const field = rec.fields.find(f => f.name === stmt.as);
        if (!field) { errors.push(`${here}: "${stmt.kind} ${stmt.record} as ${stmt.as}" — no field "${stmt.as}" on ${recordName}`); continue; }
        const isVector = field.type.kind === "vector";
        if (stmt.kind === "scan" && !isVector) errors.push(`${here}: "scan ... as ${stmt.as}" must fill a vector field, but "${stmt.as}" on ${recordName} is scalar`);
        if (stmt.kind === "parse" && isVector) errors.push(`${here}: "parse ... as ${stmt.as}" must fill a scalar field, but "${stmt.as}" on ${recordName} is a vector`);
        const elem = fieldRecord(field.type);
        if (elem !== stmt.record) errors.push(`${here}: "${stmt.kind} ${stmt.record} as ${stmt.as}" — field "${stmt.as}" holds ${elem}, not ${stmt.record}`);
        // The leaf is either a grammar (`grammar/X`, scan or parse) or a TTable
        // (`TTable/X`, always a vector ⇒ scan only); its produced record must match.
        if (stmt.grammar.startsWith("TTable/")) {
          const tname = stmt.grammar.slice("TTable/".length);
          const tt = ttablesOf(program).find(t => t.name === tname);
          if (!tt) errors.push(`${here}: ${stmt.grammar} is not a defined TTable`);
          else {
            if (stmt.kind === "parse") errors.push(`${here}: ${stmt.grammar} yields a vector ([${tt.row}?]) — use scan, not parse`);
            if (tt.row !== stmt.record) errors.push(`${here}: ${stmt.grammar} produces ${tt.row} rows, but "${stmt.kind} ${stmt.record}" expects ${stmt.record}`);
          }
        } else {
          const gRec = grammarReturnRecord(stmt.grammar, program);
          if (gRec === null) errors.push(`${here}: ${stmt.grammar} is not a record-returning grammar`);
          else if (gRec !== stmt.record) errors.push(`${here}: ${stmt.grammar} returns ${gRec}, but "${stmt.kind} ${stmt.record}" expects ${stmt.record}`);
        }
      }
    }
  };

  const rootRecord = ast.root.target;
  if (!ast.root.grammar) {
    errors.push(`${here}: the root "within ${rootRecord}" needs a grammar (using grammar/...)`);
  } else {
    const gRec = grammarReturnRecord(ast.root.grammar, program);
    if (gRec === null) errors.push(`${here}: root grammar ${ast.root.grammar} is not a record-returning grammar`);
    else if (gRec !== rootRecord) errors.push(`${here}: root grammar ${ast.root.grammar} returns ${gRec}, but the root is ${rootRecord}`);
  }
  if (!recordByName.has(rootRecord)) errors.push(`${here}: unknown root record "${rootRecord}"`);
  else checkScope(ast.root, rootRecord);
  return errors;
}

// A compiled defextract: a *synchronous* leaf (it only calls grammar leaves, which
// are synchronous), callable as `extract/<name>` with arity 1 (the input string).
export type CompiledExtract = {
  arity: number;
  impl: (...args: unknown[]) => unknown;
};

// A grammar leaf as the extract needs it: the plain impl (used for the root parse and
// for scalar `parse` binds) plus, for scan-mode grammars, the span-aware scan.
export type GrammarLeaf = {
  impl: (...args: unknown[]) => unknown;
  scan?: (input: unknown) => ScanMatch[];
};
export type GrammarLeaves = Record<string, GrammarLeaf>;

// Span-based desugaring of a defextract onto the grammar leaves — it adds no matching
// logic, it orchestrates the leaves:
//   • the root `within` parses the whole input with its grammar (a complete record
//     with leaf scalars filled and structural fields empty);
//   • each `scan` enriches a vector field by scanning its grammar over the current
//     region, AND remembers each match's consumed span; a `parse` fills a scalar field;
//   • a nested `within f` recurses into the vector `f` a prior scan produced, processing
//     each element over THAT ELEMENT'S SPAN (span-based — no region field needed). This
//     is exactly `as mapping`: it returns NEW element records, immutable, order-preserved.
//
// The span (Ohm's `node.sourceString`) is what frees the author from declaring a `body`
// region field: the matcher already knows the text each match covered.
export function compileExtract(ast: ExtractAST, leaves: GrammarLeaves): CompiledExtract {
  const callImpl = (ref: string, region: unknown): unknown => {
    const leaf = leaves[ref];
    if (!leaf) return new Contradiction("extract/unknown-grammar", new Set(), new Error(`no leaf "${ref}"`));
    return leaf.impl(region);
  };

  // Defensive fallback only: a nested `within` whose target was not span-scanned (it
  // always should be) falls back to the element's `body` field, then the empty string.
  const regionFallback = (el: unknown): unknown =>
    el && typeof el === "object" && "body" in el ? (el as { body: unknown }).body : "";

  const processBody = (
    record: Record<string, unknown>,
    body: ExtractStmt[],
    region: unknown,
  ): Record<string, unknown> => {
    let rec = record;
    // Spans of the elements each `scan` produced, keyed by the field they filled. A
    // later nested `within f` reads these to recurse into each element's matched text.
    const spansByField = new Map<string, string[]>();
    for (const stmt of body) {
      if (stmt.kind === "within") {
        const elems = rec[stmt.target];
        if (Array.isArray(elems)) {
          const spans = spansByField.get(stmt.target);
          rec = {
            ...rec,
            [stmt.target]: elems.map((el, i) =>
              processBody(
                el as Record<string, unknown>,
                stmt.body,
                spans ? spans[i] ?? "" : regionFallback(el),
              ),
            ),
          };
        }
      } else if (stmt.kind === "scan") {
        const leaf = leaves[stmt.grammar];
        if (leaf?.scan) {
          const matches = leaf.scan(region);
          rec = { ...rec, [stmt.as]: matches.map(m => m.record) };
          spansByField.set(stmt.as, matches.map(m => m.span));
        } else {
          rec = { ...rec, [stmt.as]: callImpl(stmt.grammar, region) };
        }
      } else {
        // parse: a scalar sub-record over the current region.
        rec = { ...rec, [stmt.as]: callImpl(stmt.grammar, region) };
      }
    }
    return rec;
  };

  const impl = (...args: unknown[]): unknown => {
    const input = args[0];
    if (typeof input !== "string") return new Contradiction("extract/not-a-string", new Set());
    const rootRef = ast.root.grammar;
    if (!rootRef) return new Contradiction("extract/no-root-grammar", new Set());
    const root = callImpl(rootRef, input);
    if (root instanceof Contradiction) return root;
    if (!root || typeof root !== "object") return root;
    return processBody(root as Record<string, unknown>, ast.root.body, input);
  };

  return { arity: 1, impl };
}
