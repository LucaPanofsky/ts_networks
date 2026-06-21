import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
import { networksOf, extractsOf } from "../../src/language/select.js";

// ── Alternation-branch coverage invariant ─────────────────────────────────────
//
// Several grammar rules are a choice of alternatives — `Term { Propagate | Switch | Cell
// | Constant }`, `ExtractStmt { Scan | Parse | Within }`. The risk a behavioral test won't
// catch: a single branch quietly stops being collected (a missed semantic action, a wrong
// rule arity), so the list comes back short with NO parse error to flag it.
//
// These tests pin the invariant for the two multi-branch rules: each parses ONE program
// exercising EVERY branch and asserts each survives collection — so a dropped branch fails
// here, named for the cause, instead of surfacing as a confusing empty result downstream.
// (This guarded a Lezer wrapper-descent footgun originally; it now guards the modular Ohm
// parser's branch coverage just the same.)

describe("alternation branches are all collected (none silently dropped)", () => {
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
    const kinds = networksOf(program)[0]!.terms.map(t => t.kind);
    // Every alternative present, none lost to a missing wrapper descent.
    expect(kinds).toEqual(expect.arrayContaining(["cell", "constant", "propagate", "switch"]));
    expect(networksOf(program)[0]!.terms).toHaveLength(4);
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
    const body = extractsOf(program)[0]!.root.body;
    expect(body.map(s => s.kind)).toEqual(["scan", "parse", "within"]);
    // The nested WithinBlock branch was descended into and kept its own scan.
    const nested = body.find(s => s.kind === "within");
    expect(nested && nested.kind === "within" && nested.body.map(s => s.kind)).toEqual(["scan"]);
  });
});
