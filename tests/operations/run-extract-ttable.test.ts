import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/operations/run.js";
import { typecheck } from "../../src/operations/typecheck.js";

// Composing defextract + TTable: a defextract bind uses a TTable leaf
// (`scan Equivalence as rows using TTable/Equivalences`). End-to-end through the real
// pipeline, plus a typecheck that the composition is accepted.

const source = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_annex.tsn"), "utf8");
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
