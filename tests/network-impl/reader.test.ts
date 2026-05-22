import { readNetwork } from "../../src/network-impl/reader.js";
import { createRegistry } from "../../src/registry.js";
import { Something } from "../../src/info-structure.js";

const dsl = `
defnetwork abc
  signature: from [a, b] to c;
  propagate add from [a, b] to c;
  propagate sub from [c, a] to b;
  propagate sub from [c, b] to a;
end
`;

function makeRegistry() {
  const reg = createRegistry();
  reg.register({ fnName: "add", arity: 2, impl: (a, b) => (a as number) + (b as number), morphism: { from: ["number", "number"], to: "number" } });
  reg.register({ fnName: "sub", arity: 2, impl: (a, b) => (a as number) - (b as number), morphism: { from: ["number", "number"], to: "number" } });
  return reg;
}

describe("readNetwork: DSL wiring smoke test", () => {
  test("given a and b, derives c", () => {
    const runtime = readNetwork(dsl, makeRegistry());
    const result = runtime.invoke({ a: 2, b: 3 });
    expect(result.type).toBe("done");
    expect(result.cells.get("c")!.knows()).toEqual(new Something(5));
  });
});
