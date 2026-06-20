// parse-strict — error-format parity. The bridge must fail like the Lezer front end:
// a single `Syntax error at line X, col Y` with positions ABSOLUTE to the whole source,
// not the block-relative Ohm message the construct modules throw. `check` and Gavagai
// read that exact shape.

import { parseProgramStrict, posToLineCol } from "../../src/language/parse-strict.js";

describe("parse-strict — Syntax error format parity", () => {
  test("a valid program parses (same nodes as the plain modular parser)", () => {
    const nodes = parseProgramStrict("defrecord R\n  x: String?;\nend\n").nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.kind).toBe("record");
  });

  test("a parameter without a type clause is a Syntax error in the engine's format", () => {
    expect(() => parseProgramStrict("defparameter foo\nend")).toThrow(
      /^Syntax error at line \d+, col \d+$/,
    );
  });

  test("unanchored source (no construct keyword) is a Syntax error, not an empty program", () => {
    // The splitter drops text before the first anchor; the engine flags it. Both the
    // all-garbage case and stray text BEFORE a valid construct must throw.
    expect(() => parseProgramStrict("this is not (((a program")).toThrow(/^Syntax error/);
    expect(() => parseProgramStrict("garbage\ndefrecord R\n  x: String?;\nend\n")).toThrow(
      /^Syntax error at line 1, col 1$/,
    );
  });

  test("an empty or comment-only source is a valid (empty) program", () => {
    expect(parseProgramStrict("").nodes).toEqual([]);
    expect(parseProgramStrict("// just a comment\n\n").nodes).toEqual([]);
  });

  test("the reported position is ABSOLUTE to the source, not block-relative", () => {
    // The first record is well-formed; the SECOND (starting at line 5) is malformed
    // (missing `:`). A block-relative report would say line ~2; absolute must be ≥ 5.
    const src =
      "defrecord Ok\n" + //        line 1
      "  x: String?;\n" + //       line 2
      "end\n" + //                 line 3
      "\n" + //                    line 4
      "defrecord Bad\n" + //       line 5
      "  x String?;\n" + //        line 6  (missing colon)
      "end\n"; //                  line 7
    let line = 0;
    try {
      parseProgramStrict(src);
    } catch (e) {
      const m = /line (\d+),/.exec((e as Error).message);
      line = m ? Number(m[1]) : 0;
    }
    expect(line).toBeGreaterThanOrEqual(5);
  });

  test("posToLineCol matches the engine's 1-based reporting", () => {
    expect(posToLineCol("ab\ncd", 0)).toEqual({ line: 1, col: 1 });
    expect(posToLineCol("ab\ncd", 3)).toEqual({ line: 2, col: 1 });
    expect(posToLineCol("ab\ncd", 4)).toEqual({ line: 2, col: 2 });
  });
});
