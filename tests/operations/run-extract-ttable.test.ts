import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/operations/run.js";
import { typecheck } from "../../src/operations/typecheck.js";

// Composing defextract + TTable: a defextract bind uses a TTable leaf
// (`scan Equivalence as rows using TTable/Equivalences`). End-to-end through the real
// pipeline, plus a typecheck that the composition is accepted.

const source = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_annex.tsn"), "utf8");
const totalSource = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_total.tsn"), "utf8");
const text = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_extract.txt"), "utf8");

type Annex = { __type: string; title: string; rows: Array<{ old: string; lisbon: string; newNum: string }> };

describe("defextract + TTable: treaty annex", () => {
  test("the composition type-checks", () => {
    expect(typecheck.handle({ source }).ok).toBe(true);
  });

  test("the extract delegates the table region to the TTable leaf", async () => {
    const result = await run.handle({
      source,
      network: "extractAnnex",
      cells: { doc: JSON.stringify(text) },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const annex = result.cells["annex"] as Annex;
    expect(annex.__type).toBe("Annex");
    // The grammar captured the title…
    expect(annex.title).toBe("TABLES OF EQUIVALENCES REFERRED TO IN ARTICLE 5 OF THE TREATY OF LISBON");
    // …and the TTable leaf filled the rows.
    expect(annex.rows.every(r => (r as { old: string }).old !== undefined)).toBe(true);
    const article1 = annex.rows.find(r => r.old === "Article 1")!;
    expect(article1).toMatchObject({ old: "Article 1", lisbon: "Article 1", newNum: "Article 1" });
    const newArticle = annex.rows.find(r => r.lisbon === "Article 1a")!;
    expect(newArticle.old).toBe("");
  });
});

describe("defextract + declared TTable: treaty grouped by TITLE (Route B, no fold)", () => {
  type Total = { __type: string; title: string; groups: Array<{ rows: Array<{ old: string; lisbon: string; newNum: string }> }> };

  test("the grouped parse type-checks", () => {
    expect(typecheck.handle({ source: totalSource }).ok).toBe(true);
  });

  test("rows are grouped under their TITLE block via span recursion", async () => {
    const result = await run.handle({ source: totalSource, network: "extractTotal", cells: { doc: JSON.stringify(text) } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const total = result.cells["annex"] as Total;
    expect(total.groups).toHaveLength(2);

    // Each group's first row is its TITLE row; the rest are article rows.
    const [g1, g2] = total.groups;
    expect(g1!.rows[0]!.old).toContain("TITLE I");
    expect(g2!.rows[0]!.old).toContain("TITLE II");
    expect(g1!.rows).toHaveLength(12); // TITLE I row + 11 articles
    expect(g2!.rows).toHaveLength(5);  // TITLE II row + 4 articles

    // A data row inside the first group, columns positional (declared mode).
    const a1 = g1!.rows.find(r => r.old === "Article 1")!;
    expect(a1).toMatchObject({ old: "Article 1", lisbon: "Article 1", newNum: "Article 1" });
  });
});
