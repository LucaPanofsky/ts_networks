import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/operations/run.js";

// Step 3: end-to-end through the real pipeline. The `run` operation compiles the
// example and executes the network, whose `propagate TTable/Equivalences` resolves the
// table leaf from the registry.

const source = readFileSync(join(__dirname, "../../examples/treaty_table/treaty.tsn"), "utf8");
const text = readFileSync(join(__dirname, "../../examples/treaty_table/treaty_extract.txt"), "utf8");

type Row = { __type: string; old: string; lisbon: string; newNum: string };

describe("run operation: TTable end-to-end (treaty table)", () => {
  test("a network propagating TTable/<name> produces the rows", async () => {
    const result = await run.handle({
      source,
      network: "extractTable",
      cells: { doc: JSON.stringify(text) },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = result.cells["rows"] as Row[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every(r => r.__type === "Equivalence")).toBe(true);

    // Columns mapped by header name.
    const article1 = rows.find(r => r.old === "Article 1")!;
    expect(article1).toMatchObject({ old: "Article 1", lisbon: "Article 1", newNum: "Article 1" });
    // Empty cell stays "" (asserted absence).
    const newArticle = rows.find(r => r.lisbon === "Article 1a")!;
    expect(newArticle.old).toBe("");
    expect(newArticle.newNum).toBe("Article 2");
  });
});
