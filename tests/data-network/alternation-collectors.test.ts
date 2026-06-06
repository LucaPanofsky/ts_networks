import { parseProgram } from "../../src/data-network/tree-to-network.js";

// ── Lezer alternation-wrapper invariant ───────────────────────────────────────
//
// A lezer rule of the form `X { A | B | C }` does NOT inline the choice: it produces
// an `X` WRAPPER node whose single child is the matched alternative. So every
// collector for such a rule must `firstChild()` into the wrapper before dispatching on
// the inner node's name. Forget that descent and the branch is silently dropped — the
// collected list comes back empty, with NO parse error to flag it.
//
// These tests pin that invariant for the two wrapper rules whose collectors hand-roll
// the descent (`Term` and `ExtractStmt`). Each parses ONE program exercising EVERY
// branch and asserts each branch survives collection — so a broken/removed descent
// fails here, named for the actual cause, instead of surfacing as a confusing empty
// result in some unrelated feature test downstream.

describe("alternation wrappers are descended into (no branch silently dropped)", () => {
  // Term { PropagateTerm | SwitchTerm | CellTerm | ConstantTerm }
  test("Term: all four branches collect", () => {
    const program = parseProgram(`
defnetwork allTerms
  signature: from [a] to d;
  cell x = 42;
  constant pi = 3;
  propagate f from [a] to b;
  switch from [b] to d;
end
`);
    const kinds = program.networks[0]!.terms.map(t => t.kind);
    // Every alternative present, none lost to a missing wrapper descent.
    expect(kinds).toEqual(expect.arrayContaining(["cell", "constant", "propagate", "switch"]));
    expect(program.networks[0]!.terms).toHaveLength(4);
  });

  // ExtractStmt { ScanStmt | ParseStmt | WithinBlock } — itself nested inside a
  // WithinBlock, which is a third alternative reached by recursion.
  test("ExtractStmt: scan, parse, and nested within all collect", () => {
    const program = parseProgram(`
defextract Doc
  within Article using grammar/Article
    scan Paragraph as paragraphs using grammar/Paragraph;
    parse Title as title using grammar/Title;
    within paragraphs
      scan Point as points using grammar/Point;
    end
  end
end
`);
    const body = program.extracts[0]!.root.body;
    expect(body.map(s => s.kind)).toEqual(["scan", "parse", "within"]);
    // The nested WithinBlock branch was descended into and kept its own scan.
    const nested = body.find(s => s.kind === "within");
    expect(nested && nested.kind === "within" && nested.body.map(s => s.kind)).toEqual(["scan"]);
  });
});
