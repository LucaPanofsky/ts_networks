import { runTtable } from "../../src/operations/run-ttable.js";

// run-ttable is the tabular twin of run-grammar: run ONE named TTable from a program
// against ONE input string, in isolation, returning the parsed rows — or a located
// failure. A TTable always yields an array of rows; a malformed row is a per-row
// Contradiction (surfaced as a value in `rows`, NOT a whole-table failure), which is
// the table's self-validation contract and the most useful thing to show an author.
// (Distinct from tests/operations/run-ttable.test.ts, which drives a TTable as a
// propagator through the `run` operation.)

const located = `
defrecord Pair
  x: String?;
  y: String?;
end

TTable Pairs
  row: Pair;
  cell: '|';
  header x = 'X';
  header y = 'Y';
end
`;

const headerless = `
defrecord Row3
  a: String?;
  b: String?;
  c: String?;
end

TTable Headerless
  row: Row3;
  cell: '|';
  header a;
  header b;
  header c;
end
`;

describe("run-ttable: capabilities", () => {
  test("located mode — the header row is consumed and columns map by name", () => {
    const r = runTtable.handle({ source: located, ttable: "Pairs", input: "X | Y |\na | b |\nc | d |\n" });
    expect(r).toEqual({
      ok: true,
      rows: [
        { __type: "Pair", x: "a", y: "b" },
        { __type: "Pair", x: "c", y: "d" },
      ],
    });
  });

  test("positional mode — the first row is consumed; the rest map by declaration order", () => {
    const r = runTtable.handle({ source: headerless, ttable: "Headerless", input: "h1 | h2 | h3 |\n1 | 2 | 3 |\n" });
    expect(r).toEqual({ ok: true, rows: [{ __type: "Row3", a: "1", b: "2", c: "3" }] });
  });
});

describe("run-ttable: negative — located failures", () => {
  // The keystone of the tool: a malformed row is surfaced as a per-row value, not a
  // whole-table failure — the table self-validates and refuses to guess.
  test("a wrong-cell-count row is a per-row contradiction, the rest still parse", () => {
    const r = runTtable.handle({ source: located, ttable: "Pairs", input: "X | Y |\na | b |\nonly_one |\n" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows[0]).toEqual({ __type: "Pair", x: "a", y: "b" });
      expect(r.rows[1]).toMatchObject({ __contradiction: "ttable/malformed-row" });
      expect((r.rows[1] as { reason: string }).reason).toMatch(/expected 2 cells/);
    }
  });

  test("a declared header absent from the input is a located no-match", () => {
    const r = runTtable.handle({ source: located, ttable: "Pairs", input: "A | B |\n1 | 2 |\n" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("no-match");
      expect(r.error).toMatch(/X/); // names the missing header
    }
  });

  test("input with no delimiter line is a no-match (no header)", () => {
    const r = runTtable.handle({ source: located, ttable: "Pairs", input: "no pipes here\nstill none\n" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("no-match");
  });

  test("a header bound to a non-field is a syntax error", () => {
    const bad = `
defrecord Pair
  x: String?;
  y: String?;
end

TTable Bad
  row: Pair;
  cell: '|';
  header x = 'X';
  header z = 'Z';
end
`;
    const r = runTtable.handle({ source: bad, ttable: "Bad", input: "X | Z |\n1 | 2 |\n" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("syntax");
      expect(r.error).toMatch(/not a field of Pair/);
    }
  });

  test("an unknown ttable name is reported with the defined names", () => {
    const r = runTtable.handle({ source: located, ttable: "Nope", input: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("unknown-ttable");
      expect(r.error).toMatch(/Pairs/);
    }
  });

  test("source that does not parse is a parse error, not a crash", () => {
    const r = runTtable.handle({ source: "this is not (((a program", ttable: "X", input: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("parse");
  });
});

describe("run-ttable: invariant — isolation", () => {
  // A broken sibling GRAMMAR must not block running the TTable: createSandbox compiles
  // every grammar eagerly and throws on the first bad body. The handler strips grammars
  // (a TTable needs none) so an unrelated broken grammar cannot escape. Without the
  // strip, this fails (the throw is caught as a syntax error → ok:false).
  const broken = `
defgrammar Broken
  signature: from [String?(text)] to Pair?;
  """
Broken { z = = }
"""
end
`;

  test("a broken sibling grammar does not block running the ttable", () => {
    const r = runTtable.handle({ source: located + broken, ttable: "Pairs", input: "X | Y |\na | b |\n" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows).toEqual([{ __type: "Pair", x: "a", y: "b" }]);
  });
});
