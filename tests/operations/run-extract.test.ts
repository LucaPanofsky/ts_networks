import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/operations/run.js";

// B2: end-to-end through the real pipeline. The `run` operation compiles the example
// program (parse → sandbox → registry → networks) and executes the network, whose
// `propagate extract/GdprArticle` resolves the extract leaf from the registry. This
// proves the wiring, not just compileExtract in isolation (that is extract-runtime.test).

const source = readFileSync(join(__dirname, "../../repo_workspace/examples/gdpr_article_extract.tsn"), "utf8");
const text = readFileSync(join(__dirname, "../../repo_workspace/examples/gdpr_article_33.txt"), "utf8");

type Article = {
  __type: string; number: string; title: string;
  paragraphs: Array<{ number: string; points: Array<{ label: string }> }>;
};

describe("run operation: defextract end-to-end (GDPR Article 33)", () => {
  test("a network propagating extract/<name> produces the nested record", async () => {
    // The `doc` cell value is a JS expression evaluated in the sandbox; a JSON string
    // literal evaluates to the raw fixture text.
    const result = await run.handle({
      source,
      network: "extractArticle",
      cells: { doc: JSON.stringify(text) },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const article = result.cells["article"] as Article;
    expect(article.__type).toBe("Article");
    expect(article.number).toBe("33");
    expect(article.title).toBe("Notification of a personal data breach to the supervisory authority");
    expect(article.paragraphs.map(p => p.number)).toEqual(["1", "2", "3", "4", "5"]);
    // Points nested under their own paragraph — the whole point of the construct.
    expect(article.paragraphs[2]!.points.map(p => p.label)).toEqual(["a", "b", "c", "d"]);
    expect(article.paragraphs[0]!.points).toEqual([]);
  });
});
