import { compileGrammar } from "../../src/sandbox/grammar-runtime.js";
import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
import { recordsOf, grammarsOf } from "../../src/language/select.js";
import { recordCtorSandbox } from "../../src/sandbox/record-sandbox.js";
import { Contradiction } from "../../src/info-structure.js";

// Build a grammar's runtime through the real pipeline: parse the DSL, compile the
// record constructors into a sandbox, then compile the named grammar against it.
function build(dsl: string, grammarName: string) {
  const program = parseProgram(dsl);
  const sandbox = recordCtorSandbox(recordsOf(program));
  const ast = grammarsOf(program).find(g => g.name === grammarName)!;
  return compileGrammar(ast, program, sandbox);
}

// A Citation grammar whose field rules (`title`, `section`) match record fields and
// capture exactly the values of interest (the "§"/"U.S.C." literals sit in the
// parent rule, so they are not captured).
const citationGrammar = `
Citation {
  cite = title spaces "U.S.C." spaces "§" spaces section
  title = digit+
  section = digit+
}
`;

const scalarDsl = `
defrecord CitationRec
  title: String?;
  section: String?;
end

defgrammar Citation
  signature: from [String?(text)] to CitationRec?;
  """${citationGrammar}"""
end
`;

const vectorDsl = `
defrecord CitationRec
  title: String?;
  section: String?;
end

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

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("compileGrammar: scalar (whole-string parse → record)", () => {
  const { arity, impl } = build(scalarDsl, "Citation");

  test("arity matches signature param count", () => {
    expect(arity).toBe(1);
  });

  test("a whole-string match yields the declared record", () => {
    expect(impl("17 U.S.C. § 106")).toEqual({ __type: "CitationRec", title: "17", section: "106" });
  });
});

describe("compileGrammar: vector signature (island scan → [record])", () => {
  const { impl } = build(vectorDsl, "Citations");

  test("extracts every embedded match from a longer string", () => {
    const doc = "See 17 U.S.C. § 106 and also 35 U.S.C. § 271 for details.";
    expect(impl(doc)).toEqual([
      { __type: "CitationRec", title: "17", section: "106" },
      { __type: "CitationRec", title: "35", section: "271" },
    ]);
  });
});

describe("compileGrammar: vector field collects repeated rule applications", () => {
  const dsl = `
defrecord Nums
  item: [String?];
end

defgrammar NumList
  signature: from [String?(text)] to Nums?;
  """
NumList {
  list = item (spaces item)*
  item = digit+
}
"""
end
`;
  const { impl } = build(dsl, "NumList");

  test("a repeated field rule is gathered into an array", () => {
    expect(impl("1 2 3")).toEqual({ __type: "Nums", item: ["1", "2", "3"] });
  });
});

describe("compileGrammar: no signature → bare recognizer", () => {
  const dsl = `
defgrammar Word
  """
Word {
  word = letter+
}
"""
end
`;
  const { arity, impl } = build(dsl, "Word");

  test("recognizer has arity 1", () => {
    expect(arity).toBe(1);
  });

  test("returns the matched text on success", () => {
    expect(impl("hello")).toBe("hello");
  });
});

// ── Invariants ──────────────────────────────────────────────────────────────────

describe("compileGrammar: invariants", () => {
  test("scan never fails — zero matches yields an empty array, not a Contradiction", () => {
    const { impl } = build(vectorDsl, "Citations");
    expect(impl("there are no citations here")).toEqual([]);
  });

  test("scan is order-preserving (matches appear in source order)", () => {
    const { impl } = build(vectorDsl, "Citations");
    const out = impl("35 U.S.C. § 271 then 17 U.S.C. § 106") as Array<{ title: string }>;
    expect(out.map(r => r.title)).toEqual(["35", "17"]);
  });
});

// ── Negative ────────────────────────────────────────────────────────────────────

describe("compileGrammar: negative", () => {
  test("a whole-string parse failure is a Contradiction", () => {
    const { impl } = build(scalarDsl, "Citation");
    expect(impl("this is not a citation")).toBeInstanceOf(Contradiction);
  });

  test("trailing text defeats a whole-string parse (Contradiction)", () => {
    const { impl } = build(scalarDsl, "Citation");
    expect(impl("17 U.S.C. § 106 and more")).toBeInstanceOf(Contradiction);
  });

  test("a non-string input is a Contradiction", () => {
    const { impl } = build(scalarDsl, "Citation");
    expect(impl(42)).toBeInstanceOf(Contradiction);
  });

  test("a grammar whose Ohm name differs from the defgrammar name is rejected at compile time", () => {
    const dsl = `
defgrammar Citation
  """
Wrong { x = "a" }
"""
end
`;
    expect(() => build(dsl, "Citation")).toThrow(/name/i);
  });

  test("invalid Ohm source is rejected at compile time", () => {
    const dsl = `
defgrammar Bad
  """
this is not a valid ohm grammar
"""
end
`;
    expect(() => build(dsl, "Bad")).toThrow();
  });
});
