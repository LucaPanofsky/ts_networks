import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Something, Contradiction } from "../../../src/info-structure.js";

// A grammar bound to a record, used as an ordinary propagator inside a network. The
// grammar leaf is synchronous, so the network settles under the plain `invoke` path.
const dsl = `
defrecord CitationRec
  title: String?;
  section: String?;
end

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

defnetwork parseOne
  signature: from [text] to cite;
  propagate grammar/Citation from [text] to cite;
end

defnetwork scanAll
  signature: from [doc] to cites;
  propagate grammar/Citations from [doc] to cites;
end
`;

describe("compile: defgrammar end-to-end", () => {
  const result = compile(dsl);

  test("registry exposes grammar/<name>", () => {
    expect(result.registry.get("grammar/Citation")).toBeDefined();
    expect(result.registry.get("grammar/Citations")).toBeDefined();
  });

  test("grammar entry has arity 1 and the signature morphism", () => {
    const entry = result.registry.get("grammar/Citation")!;
    expect(entry.arity).toBe(1);
    expect(entry.morphism).toEqual({ from: ["String?"], to: "CitationRec?" });
  });

  test("vector signature morphism is a vector type", () => {
    expect(result.registry.get("grammar/Citations")!.morphism.to).toBe("[CitationRec?]");
  });

  test("a network parses a whole string into the bound record", () => {
    const run = result.networks.get("parseOne")!.invoke({ text: "17 U.S.C. § 106" });
    expect(run.type).toBe("done");
    expect(run.cells.get("cite")!.knows()).toEqual(
      new Something({ __type: "CitationRec", title: "17", section: "106" }),
    );
  });

  test("a network scans a longer string into an array of records", () => {
    const doc = "See 17 U.S.C. § 106 and also 35 U.S.C. § 271.";
    const run = result.networks.get("scanAll")!.invoke({ doc });
    expect(run.type).toBe("done");
    expect(run.cells.get("cites")!.knows()).toEqual(
      new Something([
        { __type: "CitationRec", title: "17", section: "106" },
        { __type: "CitationRec", title: "35", section: "271" },
      ]),
    );
  });

  test("a non-citation string yields a Contradiction in the cell", () => {
    const run = result.networks.get("parseOne")!.invoke({ text: "no citation here" });
    expect(run.cells.get("cite")!.knows()).toBeInstanceOf(Contradiction);
  });
});
