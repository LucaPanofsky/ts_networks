import { buildNetworks } from "../../../src/sandbox/scittle/networks.js";
import { compile } from "../../../src/sandbox/scittle/index.js";
import { createRegistry } from "../../../src/registry.js";
import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { Something, Nothing } from "../../../src/info-structure.js";

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

describe("buildNetworks: switch — with explicit predicate", () => {
  const src = `
defn positive?
  signature: from [Number?(x)] to Boolean?;
  expression x > 0;
end

defnetwork gate
  signature: from [test, value] to result;
  switch positive? from [test, value] to result;
end
`;
  const compiled = compile(src);
  const gate = compiled.networks.get("gate")!;

  test("passes value through when predicate is true", () => {
    const result = gate.invoke({ test: 5, value: 42 });
    expect(result.cells.get("result")!.knows()).toEqual(new Something(42));
  });

  test("returns Nothing when predicate is false", () => {
    const result = gate.invoke({ test: -1, value: 42 });
    expect(result.cells.get("result")!.knows()).toBe(Nothing);
  });

  test("returns Nothing when test cell is zero", () => {
    const result = gate.invoke({ test: 0, value: 42 });
    expect(result.cells.get("result")!.knows()).toBe(Nothing);
  });
});

describe("buildNetworks: switch — default __SWITCH with true?", () => {
  const switchSrc = `
defnetwork gate
  signature: from [test, value] to result;
  switch from [test, value] to result;
end
`;
  const compiled = compile(switchSrc);
  const gate = compiled.networks.get("gate")!;

  test("passes value through when test cell is boolean true", () => {
    const result = gate.invoke({ test: true, value: 42 });
    expect(result.cells.get("result")!.knows()).toEqual(new Something(42));
  });

  test("returns Nothing when test cell is false", () => {
    const result = gate.invoke({ test: false, value: 42 });
    expect(result.cells.get("result")!.knows()).toBe(Nothing);
  });

  test("returns Nothing when test cell is a non-boolean truthy value", () => {
    const result = gate.invoke({ test: "anything", value: 42 });
    expect(result.cells.get("result")!.knows()).toBe(Nothing);
  });

  test("returns Nothing when test cell is the string 'true'", () => {
    const result = gate.invoke({ test: "true", value: 42 });
    expect(result.cells.get("result")!.knows()).toBe(Nothing);
  });

  test("returns Nothing when test cell is 1", () => {
    const result = gate.invoke({ test: 1, value: 42 });
    expect(result.cells.get("result")!.knows()).toBe(Nothing);
  });

  test("returns Nothing when value cell is not provided", () => {
    const result = gate.invoke({ test: true });
    expect(result.cells.get("result")!.knows()).toBe(Nothing);
  });
});
