import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { createSandbox } from "../../src/sandbox/jsgen/runtime.js";
import { compileGrammar } from "../../src/sandbox/grammar-runtime.js";

// Point A of the defextract path: author the three Article-33 recognisers (Article
// header, Paragraph, Point) as valid, correct Ohm, and prove they extract the real
// fixture (examples/gdpr_article_33.txt). They run through the EXISTING grammar
// runtime — the same machinery defextract will desugar onto — so the grammars are
// trusted before the extract runtime is built.
//
// Paragraph/Point are scan-mode (`to [X?]`), adapted from the proven ParaScan/
// PointScan in examples/gdpr_article_structured_extraction.tsn; the extract's `scan`
// will simply call them. This is the FIELD-BASED-FIRST shape (Paragraph keeps a
// `body` field that the point scan runs over) — to be reconciled with the design's
// single-element-grammar form when span-based regions land.

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
  signature: from [String?(text)] to [Paragraph?];
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
  signature: from [String?(text)] to [Point?];
  """
  Point {
    point = "(" label ")" spaces body
    label = "a".."z"
    body  = (~mark any)*
    mark  = "(" label ")"
  }
  """
end
`;

const text = readFileSync(join(__dirname, "../../examples/gdpr_article_33.txt"), "utf8");

function compile(name: string): (...args: unknown[]) => unknown {
  const program = parseProgram(dsl);
  const sandbox = createSandbox(program);
  const ast = program.grammars.find(g => g.name === name)!;
  return compileGrammar(ast, program, sandbox).impl;
}

describe("defextract point A: Article-33 recognisers", () => {
  test("Article header → number and title (paragraphs left empty)", () => {
    const out = compile("Article")(text) as { __type: string; number: string; title: string; paragraphs: unknown[] };
    expect(out.__type).toBe("Article");
    expect(out.number).toBe("33");
    expect(out.title).toBe("Notification of a personal data breach to the supervisory authority");
    expect(out.paragraphs).toEqual([]);
  });

  test("Paragraph scan → five numbered paragraphs in order", () => {
    const out = compile("Paragraph")(text) as Array<{ number: string; body: string }>;
    expect(out.map(p => p.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(out[0]!.body).toContain("In the case of a personal data breach");
  });

  test("Point scan over paragraph 3 → lettered points a–d", () => {
    const paras = compile("Paragraph")(text) as Array<{ body: string }>;
    const para3 = paras[2]!;
    const points = compile("Point")(para3.body) as Array<{ label: string; body: string }>;
    expect(points.map(p => p.label)).toEqual(["a", "b", "c", "d"]);
    expect(points[0]!.body).toContain("describe the nature");
  });
});
