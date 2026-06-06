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
// Each grammar RECOGNISES ONE record (scalar `to X?`); the defextract verb decides
// cardinality. So Article is exercised through its whole-string `impl`, while Paragraph
// and Point are exercised through their `scan` (the span-aware island scanner every
// signed grammar exposes) — that is what the extract's `scan` verb uses.

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
`;

const text = readFileSync(join(__dirname, "../../examples/gdpr_article_33.txt"), "utf8");

function compiled(name: string) {
  const program = parseProgram(dsl);
  const sandbox = createSandbox(program);
  const ast = program.grammars.find(g => g.name === name)!;
  return compileGrammar(ast, program, sandbox);
}

describe("defextract point A: Article-33 recognisers", () => {
  test("Article header → number and title (parsed once via impl)", () => {
    const out = compiled("Article").impl(text) as { __type: string; number: string; title: string; paragraphs: unknown[] };
    expect(out.__type).toBe("Article");
    expect(out.number).toBe("33");
    expect(out.title).toBe("Notification of a personal data breach to the supervisory authority");
    expect(out.paragraphs).toEqual([]);
  });

  test("Paragraph scan → five numbered paragraphs in order", () => {
    const recs = compiled("Paragraph").scan!(text).map(m => m.record) as Array<{ number: string; body: string }>;
    expect(recs.map(p => p.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(recs[0]!.body).toContain("In the case of a personal data breach");
  });

  test("Point scan over paragraph 3 → lettered points a–d", () => {
    const paras = compiled("Paragraph").scan!(text).map(m => m.record) as Array<{ body: string }>;
    const para3 = paras[2]!;
    const points = compiled("Point").scan!(para3.body).map(m => m.record) as Array<{ label: string; body: string }>;
    expect(points.map(p => p.label)).toEqual(["a", "b", "c", "d"]);
    expect(points[0]!.body).toContain("describe the nature");
  });
});
