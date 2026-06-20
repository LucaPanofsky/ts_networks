// defenum slice — a pure construct that contributes a membership predicate `Name?`.
// Oracle-parity parse + eval-and-run the predicate. Reuses the strip-and-eval harness.

import { emitJs, parseProgram } from "../../src/language/index.js";
import { parseProgramLezer as oracleParse } from "../../src/data-network/tree-to-network.js";
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

const enumSrc = `
defenum Sentiment
  'positive', 'negative', 'neutral';
end
`;

describe("defenum slice — parse → emitted .js → run", () => {
  test("parses to an EnumNode equal to the Lezer oracle's", () => {
    const node = parseProgram(enumSrc).nodes.find((n) => n.kind === "enum");
    expect(node).toEqual(oracleParse(enumSrc).enums[0]);
  });

  test("registers a membership predicate `Name?`", () => {
    const reg = run(emitJs(enumSrc));
    expect(reg.resolve("Sentiment?")("positive")).toBe(true);
    expect(reg.resolve("Sentiment?")("neutral")).toBe(true);
    expect(reg.resolve("Sentiment?")("furious")).toBe(false);
  });

  test("the predicate is callable from a defn body in the same program", () => {
    const reg = run(
      emitJs(`
defenum Sentiment
  'positive', 'negative', 'neutral';
end

defn known
  signature: from [String?(s)] to Boolean?;
  expression Sentiment?(s);
end
`),
    );
    expect(reg.resolve("known")("positive")).toBe(true);
    expect(reg.resolve("known")("furious")).toBe(false);
  });
});
