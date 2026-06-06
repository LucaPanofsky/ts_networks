import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/operations/run.js";
import { typecheck } from "../../src/operations/typecheck.js";

// Composing defextract + TTable end-to-end: a defextract bind uses a TTable leaf
// (`scan Equivalence as rows using TTable/Rows`) to parse the table inside each TITLE
// section. Drives the real pipeline, plus a typecheck that the composition is accepted.

const totalSource = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_total.tsn"), "utf8");
const text = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_extract.txt"), "utf8");

describe("defextract + declared TTable: treaty grouped by TITLE (Route B, no fold)", () => {
  type Cells = { old: string; lisbon: string; newNum: string };
  type Total = { __type: string; title: string; section: string; columns: string[]; groups: Array<{ title: Cells; rows: Cells[] }> };

  test("the grouped parse type-checks", () => {
    expect(typecheck.handle({ source: totalSource }).ok).toBe(true);
  });

  test("rows are grouped under their TITLE block; the title is the block header", async () => {
    const result = await run.handle({ source: totalSource, network: "extractTotal", cells: { doc: JSON.stringify(text) } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const total = result.cells["annex"] as Total;
    // The section label (between the annex title and the table) is captured, not dropped.
    expect(total.section).toBe("A. Treaty on European Union");
    // The column header row is captured (no longer dropped).
    expect(total.columns).toEqual([
      "Old numbering of the Treaty on European Union",
      "Numbering in the Treaty of Lisbon",
      "New numbering of the Treaty on European Union",
    ]);
    expect(total.groups).toHaveLength(2);

    const [g1, g2] = total.groups;
    // The title is a NESTED record (per-column), NOT in the rows.
    expect(g1!.title).toEqual({
      __type: "TitleRow",
      old: "TITLE I — COMMON PROVISIONS",
      lisbon: "TITLE I — COMMON PROVISIONS",
      newNum: "TITLE I — COMMON PROVISIONS",
    });
    expect(g2!.title.old).toContain("TITLE II — PROVISIONS AMENDING");
    expect(g2!.title.lisbon).toBe("TITLE II — PROVISIONS ON DEMOCRATIC PRINCIPLES"); // columns differ here
    expect(g1!.rows).toHaveLength(11); // article rows only
    expect(g2!.rows).toHaveLength(4);
    expect(g1!.rows.some(r => r.old.includes("TITLE"))).toBe(false);

    // A data row inside the first group, columns positional.
    const a1 = g1!.rows.find(r => r.old === "Article 1")!;
    expect(a1).toMatchObject({ old: "Article 1", lisbon: "Article 1", newNum: "Article 1" });
  });
});
