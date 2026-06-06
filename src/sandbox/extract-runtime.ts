import type { ExtractAST, ExtractStmt } from "../data-network/types.js";
import type { ScanMatch } from "./grammar-runtime.js";
import { Contradiction } from "../info-structure.js";

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
