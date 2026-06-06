import { runGrammar } from "../../src/operations/run-grammar.js";

// run-grammar is the micro-tool: run ONE named grammar from a program against ONE
// input string, returning the parsed record (scalar), the scanned records (vector),
// the matched span (bare recognizer) — or a LOCATED failure. The point of the tool
// is the failure path: an agent inducing a grammar needs the Ohm position, not a
// boolean. These tests pin both the success shapes and that every failure is located
// and isolated to the named grammar.

const records = `
defrecord CitationRec
  title: String?;
  section: String?;
end
`;

const scalar = `
defgrammar Citation
  signature: from [String?(text)] to CitationRec?;
  """
Citation {
  cite = title spaces "U.S.C." spaces "§" spaces section
  title = digit+
  section = digit+
}
"""
end
`;

const vector = `
defgrammar Citations
  signature: from [String?(text)] to [CitationRec?];
  """
Citations {
  cite = title spaces "U.S.C." spaces "§" spaces section
  title = digit+
  section = digit+
}
"""
end
`;

const recognizer = `
defgrammar Digits
  """
Digits { ds = digit+ }
"""
end
`;

describe("run-grammar: capabilities", () => {
  test("a scalar grammar parses the whole string into its bound record", () => {
    const r = runGrammar.handle({ source: records + scalar, grammar: "Citation", input: "17 U.S.C. § 106" });
    expect(r).toEqual({
      ok: true,
      mode: "scalar",
      result: { __type: "CitationRec", title: "17", section: "106" },
    });
  });

  test("a vector grammar scans the string into an array of records", () => {
    const r = runGrammar.handle({
      source: records + vector,
      grammar: "Citations",
      input: "See 17 U.S.C. § 106 and also 35 U.S.C. § 271.",
    });
    expect(r).toEqual({
      ok: true,
      mode: "scan",
      result: [
        { __type: "CitationRec", title: "17", section: "106" },
        { __type: "CitationRec", title: "35", section: "271" },
      ],
    });
  });

  test("a bare recognizer returns the matched span", () => {
    const r = runGrammar.handle({ source: recognizer, grammar: "Digits", input: "12345" });
    expect(r).toEqual({ ok: true, mode: "recognizer", result: "12345" });
  });
});

describe("run-grammar: negative — every failure is located", () => {
  test("a non-matching input (scalar) is a no-match with the Ohm position", () => {
    const r = runGrammar.handle({ source: records + scalar, grammar: "Citation", input: "no citation here" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("no-match");
      // The located Ohm failure: a line/col and an Expected clause.
      expect(r.error).toMatch(/Line 1/);
      expect(r.error).toMatch(/Expected/);
    }
  });

  test("a non-matching input (recognizer) is a no-match", () => {
    const r = runGrammar.handle({ source: recognizer, grammar: "Digits", input: "12 oops" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("no-match");
  });

  test("an invalid Ohm body is a syntax error", () => {
    const bad = `
defgrammar Bad
  signature: from [String?(text)] to CitationRec?;
  """
Bad { x = = }
"""
end
`;
    const r = runGrammar.handle({ source: records + bad, grammar: "Bad", input: "anything" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("syntax");
      expect(r.error).toMatch(/invalid Ohm grammar/);
    }
  });

  test("a signature binding an unknown record is a syntax error", () => {
    const orphan = `
defgrammar Orphan
  signature: from [String?(text)] to MissingRec?;
  """
Orphan { x = any* }
"""
end
`;
    const r = runGrammar.handle({ source: orphan, grammar: "Orphan", input: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("syntax");
      expect(r.error).toMatch(/unknown record/);
    }
  });

  test("an unknown grammar name is reported with the defined names", () => {
    const r = runGrammar.handle({ source: records + scalar, grammar: "Nope", input: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("unknown-grammar");
      expect(r.error).toMatch(/Citation/);
    }
  });

  test("source that does not parse is a parse error, not a crash", () => {
    const r = runGrammar.handle({ source: "this is not (((a program", grammar: "X", input: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("parse");
  });
});

describe("run-grammar: invariant — isolation", () => {
  // The keystone guarantee: a *different* broken grammar in the same program must not
  // block running the named, valid one. createSandbox compiles every grammar eagerly
  // and throws on the first broken body, so the handler must narrow compilation to the
  // named grammar. Without that narrowing, this test fails (the throw escapes).
  const broken = `
defgrammar Broken
  signature: from [String?(text)] to CitationRec?;
  """
Broken { z = = }
"""
end
`;

  test("a broken sibling grammar does not block the named valid one", () => {
    const r = runGrammar.handle({
      source: records + scalar + broken,
      grammar: "Citation",
      input: "17 U.S.C. § 106",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ __type: "CitationRec", title: "17", section: "106" });
  });
});
