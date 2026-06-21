// defgrammar slice — emit the .js, eval it against the runtime, and run the compiled
// grammar leaf. The runtime ADAPTS the existing `compileGrammar`, so these assert the
// adapter wires record construction + scan correctly. Plus an golden-snapshot parse check
// against the existing (Lezer) parser. Reuses the strip-and-eval harness from defn.test.ts.

import { emitJs, parseProgram } from "../../src/language/index.js";
import * as rt from "../../src/language/runtime/index.js";
import type { Registry } from "../../src/language/core/runtime-api.js";
import { Contradiction } from "../../src/info-structure.js";

function run(js: string): Registry {
  const body =
    js
      .split("\n")
      .filter((l) => !/^\s*import\s/.test(l) && !/^\s*export\s/.test(l))
      .join("\n") + "\nreturn __reg;";
  return new Function("rt", body)(rt) as Registry;
}

const pairSrc = `
defrecord Pair
  key: String?;
  value: String?;
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
`;

describe("defgrammar slice — parse → emitted .js → run", () => {
  test("parses to a GrammarNode matching its frozen golden (Lezer-validated at capture)", () => {
    const node = parseProgram(pairSrc).nodes.find((n) => n.kind === "grammar");
    expect(node).toMatchSnapshot();
  });

  test("a scalar `to Rec?` grammar parses the whole string into a record", () => {
    const reg = run(emitJs(pairSrc));
    expect(reg.resolve("grammar/Pair")("x=42")).toEqual({ __type: "Pair", key: "x", value: "42" });
  });

  test("a scalar grammar Contradicts on a non-matching whole string", () => {
    const reg = run(emitJs(pairSrc));
    expect(reg.resolve("grammar/Pair")("not a pair")).toBeInstanceOf(Contradiction);
  });

  test("a vector `to [Rec?]` grammar scans every embedded match", () => {
    const reg = run(
      emitJs(`
defrecord Num
  digits: String?;
end

defgrammar Nums
  signature: from [String?(text)] to [Num?];
  """
  Nums {
    num    = digits
    digits = digit+
  }
  """
end
`),
    );
    expect(reg.resolve("grammar/Nums")("a1b22c333")).toEqual([
      { __type: "Num", digits: "1" },
      { __type: "Num", digits: "22" },
      { __type: "Num", digits: "333" },
    ]);
  });

  test("a grammar with no signature is a bare recognizer (returns matched text)", () => {
    const reg = run(
      emitJs(`
defgrammar Word
  """
  Word { word = letter+ }
  """
end
`),
    );
    expect(reg.resolve("grammar/Word")("hello")).toBe("hello");
  });

  test("malformed Ohm (grammar name ≠ defgrammar name) throws at build (eval) time", () => {
    expect(() =>
      run(
        emitJs(`
defrecord Thing
  x: String?;
end

defgrammar Broken
  signature: from [String?(t)] to Thing?;
  """
  NotBroken { x = "a" }
  """
end
`),
      ),
    ).toThrow();
  });
});
