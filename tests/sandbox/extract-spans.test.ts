import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { createSandbox } from "../../src/sandbox/jsgen/runtime.js";
import { compileGrammar } from "../../src/sandbox/grammar-runtime.js";
import { compileExtract, type GrammarLeaves } from "../../src/sandbox/extract-runtime.js";

// B3: span-based regions. A scan now exposes each match's consumed span, and the
// extract recurses into that span — so a nested scope needs NO `body` region field.
// Here Paragraph has NO body field at all, yet points still nest correctly, because
// the point scan runs over each paragraph's matched SPAN.

const text = readFileSync(join(__dirname, "../../examples/gdpr_article_33.txt"), "utf8");

// Note: Paragraph has number + points only — no `body`. The grammar still consumes
// the paragraph text (rule `rest`), defining the span; it just isn't captured.
const dsl = `
defrecord Point
  label: String?;
  body:  String?;
end

defrecord Paragraph
  number: String?;
  points: [Point?];
end

defrecord Article
  number:     String?;
  paragraphs: [Paragraph?];
end

defgrammar Article
  signature: from [String?(text)] to Article?;
  """
  Article {
    doc    = "Article" spaces number spaces rest
    number = digit+
    rest   = any*
  }
  """
end

defgrammar Paragraph
  signature: from [String?(text)] to [Paragraph?];
  """
  Paragraph {
    paragraph = number "." spaces rest
    number    = digit+
    rest      = (~paraMark any)+
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

defextract GdprArticle
  within Article using grammar/Article
    scan Paragraph as paragraphs using grammar/Paragraph;
    within paragraphs
      scan Point as points using grammar/Point;
    end
  end
end
`;

function build() {
  const program = parseProgram(dsl);
  const sandbox = createSandbox(program);
  const leaves: GrammarLeaves = {};
  for (const g of program.grammars) {
    const { impl, scan } = compileGrammar(g, program, sandbox);
    leaves[`grammar/${g.name}`] = { impl, scan };
  }
  return { program, sandbox, leaves };
}

describe("scan exposes each match's span", () => {
  const { program, sandbox } = build();
  const para = compileGrammar(program.grammars.find(g => g.name === "Paragraph")!, program, sandbox);

  test("a scan-mode grammar has a `scan` that returns records paired with spans", () => {
    expect(typeof para.scan).toBe("function");
    const matches = para.scan!(text);
    expect(matches.map(m => (m.record as { number: string }).number)).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("each span is the exact text the match consumed", () => {
    const matches = para.scan!(text);
    // Paragraph 3's span carries its lettered points; paragraph 1's does not.
    expect(matches[2]!.span).toContain("3.");
    expect(matches[2]!.span).toContain("(a)");
    expect(matches[2]!.span).toContain("(d)");
    expect(matches[0]!.span).not.toContain("(a)");
  });

  test("impl is exactly scan(...).map(record) — records only", () => {
    const matches = para.scan!(text);
    expect(para.impl(text)).toEqual(matches.map(m => m.record));
  });
});

describe("defextract recurses over spans, with NO body field", () => {
  const { program, leaves } = build();
  const { impl } = compileExtract(program.extracts[0]!, leaves);

  test("points nest under their paragraph even though Paragraph has no body field", () => {
    const out = impl(text) as {
      number: string;
      paragraphs: Array<{ number: string; body?: unknown; points: Array<{ label: string }> }>;
    };
    expect(out.number).toBe("33");
    expect(out.paragraphs.map(p => p.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(out.paragraphs[2]!.points.map(p => p.label)).toEqual(["a", "b", "c", "d"]);
    expect(out.paragraphs[0]!.points).toEqual([]);
    // The region came from the match span, not a field: there is no body to carry.
    expect(out.paragraphs[2]!.body).toBeUndefined();
  });
});
