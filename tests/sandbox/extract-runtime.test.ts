import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { recordCtorSandbox } from "../../src/sandbox/record-sandbox.js";
import { compileGrammar } from "../../src/sandbox/grammar-runtime.js";
import { compileExtract } from "../../src/sandbox/extract-runtime.js";

// B1: compileExtract in isolation. Given a grammars map (the same leaves point A
// proved), it desugars the within/scan tree onto them and returns the nested record.
// Tests the pure core before the sandbox/compiler wiring (B2) lets `run` reach it.

const dsl = `
defrecord Point
  label: String?;
  body:  String?;
end

defrecord Paragraph
  number: String?;
  body:   String?;
  points: [Point?];
end

defrecord Article
  title:      String?;
  number:     String?;
  paragraphs: [Paragraph?];
end

defgrammar Article
  signature: from [String?(text)] to Article?;
  """
  Article {
    doc    = "Article" spaces number spaces title spaces rest
    number = digit+
    title  = (~"\\n" any)+
    rest   = any*
  }
  """
end

defgrammar Paragraph
  signature: from [String?(text)] to Paragraph?;
  """
  Paragraph {
    paragraph = number "." spaces body
    number    = digit+
    body      = (~paraMark any)+
    paraMark  = digit+ "."
  }
  """
end

defgrammar Point
  signature: from [String?(text)] to Point?;
  """
  Point {
    point = "(" label ")" spaces body
    label = "a".."z"
    body  = (~mark any)*
    mark  = "(" label ")"
  }
  """
end

defextract GdprArticle
  within Article using grammar/Article
    scan Paragraph as paragraphs using grammar/Paragraph;
    within paragraphs
      scan Point as points using grammar/Point;
    end
  end
end
`;

const text = readFileSync(join(__dirname, "../../repo_workspace/examples/gdpr_article_33.txt"), "utf8");

// Build the grammar leaves (impl + span-aware scan) and compile the extract against them.
function buildExtract() {
  const program = parseProgram(dsl);
  const sandbox = recordCtorSandbox(program.records);
  const leaves: Record<string, { impl: (...a: unknown[]) => unknown; scan?: ReturnType<typeof compileGrammar>["scan"] }> = {};
  for (const g of program.grammars) {
    const { impl, scan } = compileGrammar(g, program, sandbox);
    leaves[`grammar/${g.name}`] = { impl, scan };
  }
  return compileExtract(program.extracts[0]!, leaves);
}

type Article = {
  __type: string; number: string; title: string;
  paragraphs: Array<{ __type: string; number: string; points: Array<{ label: string; body: string }> }>;
};

describe("compileExtract: GDPR Article 33 end-to-end (field-based)", () => {
  const { arity, impl } = buildExtract();

  test("arity is 1 (the input string)", () => {
    expect(arity).toBe(1);
  });

  test("the root record is the parsed Article header", () => {
    const out = impl(text) as Article;
    expect(out.__type).toBe("Article");
    expect(out.number).toBe("33");
    expect(out.title).toBe("Notification of a personal data breach to the supervisory authority");
  });

  test("paragraphs are scanned into the root (five, in order)", () => {
    const out = impl(text) as Article;
    expect(out.paragraphs.map(p => p.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(out.paragraphs.every(p => p.__type === "Paragraph")).toBe(true);
  });

  // The heart of it: points are nested PER paragraph (not over the whole article).
  test("points are nested under their own paragraph", () => {
    const out = impl(text) as Article;
    expect(out.paragraphs[2]!.points.map(p => p.label)).toEqual(["a", "b", "c", "d"]);
    expect(out.paragraphs[0]!.points).toEqual([]); // paragraph 1 has no lettered points
  });

  // Invariant: enrichment is functional — a scanned point body stays bounded to its
  // paragraph (the field-based `body` region is what keeps point (d) from bleeding).
  test("each point body is bounded to its paragraph", () => {
    const out = impl(text) as Article;
    const pts = out.paragraphs[2]!.points;
    expect(pts[0]!.body).toContain("describe the nature");
    expect(pts[3]!.body).not.toContain("Where, and in so far"); // that's paragraph 4
  });
});
