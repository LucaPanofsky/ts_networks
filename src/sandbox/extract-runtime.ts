import type { ExtractAST, ExtractStmt } from "../data-network/types.js";
import { Contradiction } from "../info-structure.js";

// A compiled defextract: a *synchronous* leaf (it only calls grammar leaves, which
// are synchronous), callable as `extract/<name>` with arity 1 (the input string).
export type CompiledExtract = {
  arity: number;
  impl: (...args: unknown[]) => unknown;
};

type GrammarMap = Record<string, (...args: unknown[]) => unknown>;

// Field-based-first desugaring of a defextract onto the existing grammar runtime —
// it adds no new matching logic, it orchestrates the grammar leaves:
//   • the root `within` parses the whole input with its grammar (a complete record
//     with leaf scalars filled and structural fields empty);
//   • each `scan`/`parse` enriches a field by calling its grammar over the current
//     region (a scan grammar returns a vector, a parse grammar a scalar);
//   • a nested `within f` recurses into the vector field `f` a prior scan produced,
//     processing each element over that element's `body` field. This is exactly
//     `as mapping`: it returns NEW element records, immutable and order-preserving.
//
// The `body`-field region is the FIELD-BASED convention — the cheapest thing that
// desugars onto the proven scan→`as mapping`→scan chain with zero runtime change.
// It is replaced by each match's consumed span when span-based regions land.
export function compileExtract(ast: ExtractAST, grammars: GrammarMap): CompiledExtract {
  const callGrammar = (ref: string, region: unknown): unknown => {
    const g = grammars[ref];
    if (typeof g !== "function") {
      return new Contradiction("extract/unknown-grammar", new Set(), new Error(`no leaf "${ref}"`));
    }
    return g(region);
  };

  // Field-based region: a nested scope recurses into each element over its `body`.
  const regionOf = (el: unknown): unknown =>
    el && typeof el === "object" && "body" in el ? (el as { body: unknown }).body : "";

  const processBody = (
    record: Record<string, unknown>,
    body: ExtractStmt[],
    region: unknown,
  ): Record<string, unknown> => {
    let rec = record;
    for (const stmt of body) {
      if (stmt.kind === "within") {
        const elems = rec[stmt.target];
        if (Array.isArray(elems)) {
          rec = {
            ...rec,
            [stmt.target]: elems.map(el =>
              processBody(el as Record<string, unknown>, stmt.body, regionOf(el)),
            ),
          };
        }
      } else {
        // scan or parse: call the field's grammar over the current region.
        rec = { ...rec, [stmt.as]: callGrammar(stmt.grammar, region) };
      }
    }
    return rec;
  };

  const impl = (...args: unknown[]): unknown => {
    const input = args[0];
    if (typeof input !== "string") return new Contradiction("extract/not-a-string", new Set());
    const rootRef = ast.root.grammar;
    if (!rootRef) return new Contradiction("extract/no-root-grammar", new Set());
    const root = callGrammar(rootRef, input);
    if (root instanceof Contradiction) return root;
    if (!root || typeof root !== "object") return root;
    return processBody(root as Record<string, unknown>, ast.root.body, input);
  };

  return { arity: 1, impl };
}
