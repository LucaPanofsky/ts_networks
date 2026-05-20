import { buildNetworks } from "../../../src/sandbox/scittle/networks.js";
import { createRegistry } from "../../../src/registry.js";
import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { Something } from "../../../src/info-structure.js";

const src = `
defnetwork equations
  signature: from [a, b] to c;
  propagate add from [a, b] to c;
  propagate sub from [c, a] to b;
  propagate sub from [c, b] to a;
end

defnetwork doubler
  signature: from [x] to y;
  propagate double from [x] to y;
end
`;

function makeRegistry() {
  const registry = createRegistry();
  registry.register({ fnName: "add",    arity: 2, impl: (a, b) => (a as number) + (b as number), morphism: { from: ["Number?", "Number?"], to: "Number?" } });
  registry.register({ fnName: "sub",    arity: 2, impl: (a, b) => (a as number) - (b as number), morphism: { from: ["Number?", "Number?"], to: "Number?" } });
  registry.register({ fnName: "double", arity: 1, impl: (x) => (x as number) * 2,                morphism: { from: ["Number?"],            to: "Number?" } });
  return registry;
}

describe("buildNetworks: basic", () => {
  const program = parseProgram(src);
  const networks = buildNetworks(program, makeRegistry());

  test("returns a map with both networks", () => {
    expect(networks.size).toBe(2);
  });

  test("equations network is present", () => {
    expect(networks.has("equations")).toBe(true);
  });

  test("doubler network is present", () => {
    expect(networks.has("doubler")).toBe(true);
  });
});

describe("buildNetworks: equations network invocation", () => {
  const program = parseProgram(src);
  const networks = buildNetworks(program, makeRegistry());
  const eqs = networks.get("equations")!;

  test("given a and b, derives c", () => {
    const result = eqs.invoke({ a: 2, b: 3 });
    expect(result.cells.get("c")!.knows()).toEqual(new Something(5));
  });

  test("given a and c, derives b", () => {
    const result = eqs.invoke({ a: 2, c: 5 });
    expect(result.cells.get("b")!.knows()).toEqual(new Something(3));
  });

  test("given b and c, derives a", () => {
    const result = eqs.invoke({ b: 3, c: 5 });
    expect(result.cells.get("a")!.knows()).toEqual(new Something(2));
  });

  test("inconsistent assignment produces contradiction", () => {
    expect(eqs.invoke({ a: 2, b: 3, c: 99 }).type).toBe("exit");
  });
});

describe("buildNetworks: doubler network invocation", () => {
  const program = parseProgram(src);
  const networks = buildNetworks(program, makeRegistry());
  const doubler = networks.get("doubler")!;

  test("doubles the input", () => {
    const result = doubler.invoke({ x: 7 });
    expect(result.cells.get("y")!.knows()).toEqual(new Something(14));
  });
});
