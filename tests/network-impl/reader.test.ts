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

describe("readNetwork: equations from DSL", () => {
  const runtime = readNetwork(dsl, makeRegistry());

  test("given a and b, derives c", () => {
    const result = runtime.invoke({ a: 2, b: 3 });
    expect(result.type).toBe("done");
    expect(result.cells.get("c")!.knows()).toEqual(new Something(5));
  });

  test("given a and c, derives b", () => {
    const result = runtime.invoke({ a: 2, c: 5 });
    expect(result.type).toBe("done");
    expect(result.cells.get("b")!.knows()).toEqual(new Something(3));
  });

  test("given b and c, derives a", () => {
    const result = runtime.invoke({ b: 3, c: 5 });
    expect(result.type).toBe("done");
    expect(result.cells.get("a")!.knows()).toEqual(new Something(2));
  });

  test("inconsistent assignment produces contradiction", () => {
    const result = runtime.invoke({ a: 2, b: 3, c: 99 });
    expect(result.type).toBe("exit");
  });
});
