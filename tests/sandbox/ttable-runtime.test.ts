import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { createSandbox } from "../../src/sandbox/jsgen/runtime.js";
import { compileTTable } from "../../src/sandbox/ttable-runtime.js";
import { Contradiction } from "../../src/info-structure.js";

// Step 2: compileTTable in isolation, against the real treaty fixture. Tests the pure
// core before any registry wiring.

const text = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_extract.txt"), "utf8");

const dsl = `
defrecord Equivalence
  old:    String?;
  lisbon: String?;
  newNum: String?;
end

TTable Equivalences
  row: Equivalence;
  cell: '|';
  header old = 'Old numbering of the Treaty on European Union';
  header lisbon = 'Numbering in the Treaty of Lisbon';
  header newNum = 'New numbering of the Treaty on European Union';
end
`;

function build(program = parseProgram(dsl)) {
  const sandbox = createSandbox(program);
  const ast = program.ttables[0]!;
  return compileTTable(ast, program, sandbox);
}

type Row = { __type: string; old: string; lisbon: string; newNum: string };

describe("compileTTable: treaty table of equivalences", () => {
  const { arity, impl } = build();
  const rows = impl(text) as Row[];

  test("arity is 1", () => expect(arity).toBe(1));

  test("returns Equivalence rows; the header line is consumed", () => {
    expect(Array.isArray(rows)).toBe(true);
    // No row equals the header (it became the column map, not data).
    expect(rows.some(r => r.old === "Old numbering of the Treaty on European Union")).toBe(false);
    // The first emitted row is the TITLE row that follows the header.
    expect(rows[0]!.old).toContain("TITLE I");
  });

  test("columns map by header name", () => {
    const article1 = rows.find(r => r.old === "Article 1")!;
    expect(article1).toMatchObject({ __type: "Equivalence", old: "Article 1", lisbon: "Article 1", newNum: "Article 1" });
  });

  test("an empty cell is \"\" (asserted absence), not dropped", () => {
    // "| Article 1a | Article 2 |" — old is empty on purpose (a new article).
    const newArticle = rows.find(r => r.lisbon === "Article 1a")!;
    expect(newArticle.old).toBe("");
    expect(newArticle.newNum).toBe("Article 2");
    // "Article 3 (repealed) [1] | | |" — two empty cells.
    const repealed = rows.find(r => r.old === "Article 3 (repealed) [1]")!;
    expect(repealed.lisbon).toBe("");
    expect(repealed.newNum).toBe("");
  });

  test("the clean fixture yields no Contradictions", () => {
    expect(rows.some(r => r instanceof Contradiction)).toBe(false);
  });
});

describe("compileTTable: self-validation and malformed rows", () => {
  test("a declared header not present in the table is a Contradiction", () => {
    const badDsl = dsl.replace(
      "header old = 'Old numbering of the Treaty on European Union';",
      "header old = 'Nonexistent Column Header';",
    );
    const { impl } = build(parseProgram(badDsl));
    expect(impl(text)).toBeInstanceOf(Contradiction);
  });

  test("a row with the wrong cell count is a Contradiction at its position", () => {
    const sample =
      "old | lisbon | new |\n" +   // header (matches the declared headers below)
      "a | b | c |\n" +            // well-formed
      "x | y |\n" +                // malformed: 2 cells, not 3
      "d | e | f |\n";
    const program = parseProgram(`
defrecord R old: String?; lisbon: String?; newNum: String?; end
TTable T
  row: R;
  cell: '|';
  header old = 'old';
  header lisbon = 'lisbon';
  header newNum = 'new';
end
`);
    const sandbox = createSandbox(program);
    const out = compileTTable(program.ttables[0]!, program, sandbox).impl(sample) as unknown[];
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ __type: "R", old: "a", lisbon: "b", newNum: "c" });
    expect(out[1]).toBeInstanceOf(Contradiction); // the malformed row, localized
    expect(out[2]).toMatchObject({ __type: "R", old: "d", lisbon: "e", newNum: "f" });
  });
});
