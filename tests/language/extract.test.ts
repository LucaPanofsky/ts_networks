// defextract slice — emit + eval + run the compiled constituency orchestrator. The runtime
// ADAPTS the existing `compileExtract`, resolving leaf grammars BY NAME (impl via resolve,
// span-aware scan via scanOf). The fixture is a trimmed adaptation of
// repo_workspace/examples/gdpr_article_extract.tsn (a shipped, working extract), minus the
// network wrapper — slice 5 resolves `extract/<name>` directly.

import { emitJs, parseProgram } from "../../src/language/index.js";
import { parseProgram as oracleParse } from "../../src/data-network/tree-to-network.js";
import * as rt from "../../src/language/runtime/index.js";
import type { Registry } from "../../src/language/core/runtime-api.js";

function run(js: string): Registry {
  const body =
    js
      .split("\n")
      .filter((l) => !/^\s*import\s/.test(l) && !/^\s*export\s/.test(l))
      .join("\n") + "\nreturn __reg;";
  return new Function("rt", body)(rt) as Registry;
}

// Records (nested by reference), one single-element recogniser per kind, and the extract
// that declares the containment. Note `defrecord Article` and `defgrammar Article` coexist
// (distinct registry keys `Article` vs `grammar/Article`).
const gdprSrc = `
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

const input = "Article 33 Data breach\n1. controller shall (a) nature; (b) name;\n2. processor notifies.\n";

describe("defextract slice — parse → emitted .js → run", () => {
  test("parses to an ExtractNode equal to the Lezer oracle's", () => {
    const node = parseProgram(gdprSrc).nodes.find((n) => n.kind === "extract");
    expect(node).toEqual(oracleParse(gdprSrc).extracts[0]);
  });

  test("builds the nested record tree, with span-scoped nested scans", () => {
    const reg = run(emitJs(gdprSrc));
    const art = reg.resolve("extract/GdprArticle")(input) as {
      __type: string;
      number: string;
      title: string;
      paragraphs: { number: string; points: { label: string }[] }[];
    };

    expect(art.__type).toBe("Article");
    expect(art.number).toBe("33");
    expect(art.title).toBe("Data breach");
    expect(art.paragraphs).toHaveLength(2);
    expect(art.paragraphs[0]!.number).toBe("1");
    // points scoped to paragraph 1's SPAN: it has (a) and (b)…
    expect(art.paragraphs[0]!.points.map((p) => p.label)).toEqual(["a", "b"]);
    // …and they do NOT bleed into paragraph 2 (span isolation is the whole point).
    expect(art.paragraphs[1]!.points).toEqual([]);
  });

  test("a TTable can be a scan leaf of an extract (compose-by-type)", () => {
    const reg = run(
      emitJs(`
defrecord Row
  a: String?;
  b: String?;
end

defrecord Sheet
  rows: [Row?];
end

defgrammar Sheet
  signature: from [String?(text)] to Sheet?;
  """
  Sheet { doc = any* }
  """
end

TTable Grid
  row: Row;
  cell: '|';
  header a;
  header b;
end

defextract SheetExtract
  within Sheet using grammar/Sheet
    scan Row as rows using TTable/Grid;
  end
end
`),
    );
    const sheet = reg.resolve("extract/SheetExtract")("A | B\n1 | 2\n3 | 4") as {
      __type: string;
      rows: { __type: string; a: string; b: string }[];
    };
    expect(sheet.__type).toBe("Sheet");
    expect(sheet.rows).toEqual([
      { __type: "Row", a: "1", b: "2" },
      { __type: "Row", a: "3", b: "4" },
    ]);
  });
});
