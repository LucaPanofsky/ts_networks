// TTable slice — emit + eval + run the compiled table leaf (text → [Row?]). The runtime
// ADAPTS the existing `compileTTable`, so these assert the adapter inlines the row record +
// builds rows correctly, in both positional and located modes, plus oracle-parity parse.

import { emitJs, parseProgram } from "../../src/language/index.js";
import { parseProgram as oracleParse } from "../../src/data-network/tree-to-network.js";
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

const positionalSrc = `
defrecord Equivalence
  old: String?;
  newNum: String?;
end

TTable Rows
  row: Equivalence;
  cell: '|';
  header old;
  header newNum;
end
`;

describe("TTable slice — parse → emitted .js → run", () => {
  test("parses to a TTableNode equal to the Lezer oracle's", () => {
    const node = parseProgram(positionalSrc).nodes.find((n) => n.kind === "ttable");
    expect(node).toEqual(oracleParse(positionalSrc).ttables[0]);
  });

  test("positional mode: first delimiter-line is the header, rows map by order", () => {
    const reg = run(emitJs(positionalSrc));
    const rows = reg.resolve("TTable/Rows")("Old | New\n1 | 2\n3 | 4");
    expect(rows).toEqual([
      { __type: "Equivalence", old: "1", newNum: "2" },
      { __type: "Equivalence", old: "3", newNum: "4" },
    ]);
  });

  test("located mode: columns map by declared header text (order-independent)", () => {
    const reg = run(
      emitJs(`
defrecord Equivalence
  old: String?;
  newNum: String?;
end

TTable Rows
  row: Equivalence;
  cell: '|';
  header newNum = 'New';
  header old = 'Old';
end
`),
    );
    // declared in (newNum, old) order, but located by header text → old=1, newNum=2
    const rows = reg.resolve("TTable/Rows")("Old | New\n1 | 2");
    expect(rows).toEqual([{ __type: "Equivalence", old: "1", newNum: "2" }]);
  });

  test("a malformed row (wrong cell count) is a Contradiction at that position; good rows survive", () => {
    const reg = run(emitJs(positionalSrc));
    const rows = reg.resolve("TTable/Rows")("Old | New\n1 | 2\n3 | 4 | 5") as unknown[];
    expect(rows[0]).toEqual({ __type: "Equivalence", old: "1", newNum: "2" });
    expect(rows[1]).toBeInstanceOf(Contradiction);
  });
});
