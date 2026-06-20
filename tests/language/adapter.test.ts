// adapter — the bridge proof. `toProgramAST(modularParse(src))` must deep-equal the Lezer
// oracle's `ProgramAST` for a realistic multi-construct program, exercising all ten arrays.
// This is what justifies the adapter's structural casts and underpins the choke-point swap
// that removes Lezer: the modular parser feeds the unchanged engine through this function.
//
// (Parse-only parity — no `combine`/merge runs here, so cross-construct name clashes and
// unresolved leaf refs are irrelevant; both front ends just parse the source as written.)

import { parseProgram } from "../../src/language/index.js";
import { parseProgramLezer as oracleParse } from "../../src/data-network/tree-to-network.js";
import { toProgramAST } from "../../src/language/adapter.js";
import type { ProgramAST } from "../../src/data-network/types.js";

// One program touching every construct (predicate folds into a `fn`). Blocks are verbatim
// adaptations of the per-slice oracle fixtures, so each is known-valid in both front ends.
const src = `
defrecord Pair
  key: String?;
  value: String?;
end

defrecord Person
  name: String?;
end

defrecord Equivalence
  old: String?;
  newNum: String?;
end

defgrammar Pair
  signature: from [String?(text)] to Pair?;
  """
  Pair {
    pair  = key "=" value
    key   = letter+
    value = digit+
  }
  """
end

defn add2
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a + b;
end

defpredicate positive?
  signature: from [Number?(n)] to Boolean?;
  expression n > 0;
end

defenum Sentiment
  'positive', 'negative', 'neutral';
end

derive Adult from Person;

defllmfn analyzeDocument
  signature: from [String?(text)] to DocumentAnalysis?;
  with: model = 'claude-opus-4-7';
  user """
  Analyze: {{text}}
  """;
end

defparameter myArticle
  type: Text?;
  value:
    """
    Article 12(1)-(2) GDPR
    """;
end

TTable Rows
  row: Equivalence;
  cell: '|';
  header old;
  header newNum;
end

defnetwork pipeline
  signature: from [a, b] to out;
  cell scratch = 0;
  constant k = 'x';
  propagate add2 from [a, b] to scratch;
  propagate tag as mapping from [scratch] to out with: lang = 'en', n = '3';
  switch positive? from [a, out] to gated;
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

describe("adapter — modular Program → engine ProgramAST", () => {
  test("toProgramAST(modular) deep-equals the Lezer oracle's ProgramAST (all ten arrays)", () => {
    expect(toProgramAST(parseProgram(src))).toEqual(oracleParse(src));
  });

  test("an empty program maps to ten empty arrays", () => {
    const empty: ProgramAST = {
      networks: [], records: [], fns: [], derives: [], llmFns: [],
      enums: [], grammars: [], extracts: [], ttables: [], parameters: [],
    };
    expect(toProgramAST({ nodes: [] })).toEqual(empty);
  });

  test("predicates fold into `fns` alongside plain fns, in source order, with isPredicate", () => {
    const p = toProgramAST(parseProgram(src));
    expect(p.fns.map((f) => f.name)).toEqual(["add2", "positive?"]);
    expect(p.fns.find((f) => f.name === "positive?")!.isPredicate).toBe(true);
    expect(p.fns.find((f) => f.name === "add2")!.isPredicate).toBe(false);
  });
});
