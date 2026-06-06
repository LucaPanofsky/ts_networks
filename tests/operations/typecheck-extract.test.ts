import { readFileSync } from "node:fs";
import { join } from "node:path";
import { typecheck } from "../../src/operations/typecheck.js";

// The typecheck operation now runs the defextract type-check rules (Q3) after the
// grammar checks, before the network type-checking.

const exampleSource = readFileSync(join(__dirname, "../../examples/gdpr_article_extract.tsn"), "utf8");

// A program whose extract scans into a scalar field — a cardinality error.
const badExtract = `
defrecord Paragraph
  number: String?;
end

defgrammar Paragraph
  signature: from [String?(text)] to Paragraph?;
  """ Paragraph { p = "x" } """
end

defextract Bad
  within Paragraph using grammar/Paragraph
    scan Paragraph as number using grammar/Paragraph;
  end
end
`;

describe("typecheck operation: defextract rules", () => {
  test("the example extractor type-checks clean", () => {
    const result = typecheck.handle({ source: exampleSource });
    expect(result.ok).toBe(true);
  });

  test("a cardinality error in an extract is rejected", () => {
    const result = typecheck.handle({ source: badExtract });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must fill a vector field/);
  });
});
