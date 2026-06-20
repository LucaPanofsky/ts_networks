// derive slice — a TYPE-LEVEL declaration: parsed and carried, but a no-op at runtime
// (the engine consumes derives nowhere yet). Asserts oracle-parity parse and that it emits
// no registry artifact while the rest of the program still works.

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

const src = `
defrecord Person
  name: String?;
end

derive Adult from Person;
`;

describe("derive slice — parse + carry + no-op emit", () => {
  test("parses to a DeriveNode carrying sub/sup (oracle parity on those fields)", () => {
    const node = parseProgram(src).nodes.find((n) => n.kind === "derive") as
      | { kind: string; sub: string; sup: string }
      | undefined;
    expect(node).toBeDefined();
    expect({ kind: node!.kind, sub: node!.sub, sup: node!.sup }).toEqual(oracleParse(src).derives[0]);
  });

  test("emits a documenting comment, not a runtime artifact", () => {
    const js = emitJs(src);
    expect(js).toContain("derive Adult <: Person");
    expect(js).toContain("type-level declaration"); // a comment, not a register call
  });

  test("is a clean no-op at run time: the rest of the program works; the derive registers nothing", () => {
    const reg = run(emitJs(src));
    // the record still resolves…
    expect(reg.resolve("Person")("Ada")).toEqual({ __type: "Person", name: "Ada" });
    // …and nothing is registered under the derive (its synthetic name is unresolved).
    expect(() => reg.resolve("Adult <: Person")(null)).toThrow();
  });
});
