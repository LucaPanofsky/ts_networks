import { buildNetworks } from "../../../src/sandbox/jsgen/networks.js";
import { compile } from "../../../src/sandbox/jsgen/index.js";
import { createRegistry } from "../../../src/registry.js";
import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { Something, Nothing, Contradiction, type InfoStructure } from "../../../src/info-structure.js";
import { APromise } from "../../../src/information-structures/apromise.js";

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

describe("buildNetworks: networks are registered as callable network/<name>", () => {
  const program = parseProgram(src);
  const registry = makeRegistry();
  const networks = buildNetworks(program, registry);

  test("each network gets a network/<name> registry entry", () => {
    expect(registry.get("network/equations")).toBeDefined();
    expect(registry.get("network/doubler")).toBeDefined();
  });

  test("entry arity matches the number of signature inputs", () => {
    expect(registry.get("network/equations")!.arity).toBe(2); // from [a, b]
    expect(registry.get("network/doubler")!.arity).toBe(1);   // from [x]
  });

  test("registration does not prevent the runtimes from building", () => {
    expect(networks.size).toBe(2);
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

describe("buildNetworks: a network propagated as network/<name> inside another", () => {
  // `outer` calls `inner` (a doubler) as an ordinary propagator via the
  // network/ namespace. A sub-network is an async leaf, so the composing parent is
  // driven with invokeAsync, which settles every cell before returning.
  const compositionSrc = `
defn double
  signature: from [Number?(x)] to Number?;
  expression x * 2;
end

defn inc
  signature: from [Number?(x)] to Number?;
  expression x + 1;
end

defnetwork inner
  signature: from [x] to y;
  propagate double from [x] to y;
end

defnetwork outer
  signature: from [a] to b;
  propagate network/inner from [a] to b;
end

defnetwork conflicting
  signature: from [x] to out;
  propagate double from [x] to out;
  propagate inc from [x] to out;
end

defnetwork outerConflict
  signature: from [a] to b;
  propagate network/conflicting from [a] to b;
end
`;
  const compiled = compile(compositionSrc);

  // A sub-network is an async leaf, so the caller's cell holds an APromise that the
  // consumer awaits — the same pattern as a defllmfn cell (see llmfn.test.ts).
  const settle = async (info: InfoStructure<unknown>): Promise<InfoStructure<unknown>> =>
    info instanceof APromise ? (await info.deferred.promise as InfoStructure<unknown>) : info;

  test("the sub-network's output is unwrapped into the caller's cell", async () => {
    const result = await compiled.networks.get("outer")!.invokeAsync({ a: 5 });
    expect(await settle(result.cells.get("b")!.knows())).toEqual(new Something(10));
  });

  test("a sub-network whose leaf never fires leaves the caller's cell unknown", async () => {
    // No input → the network/inner leaf is never invoked → no APromise is created
    // and the caller's cell stays Nothing.
    const result = await compiled.networks.get("outer")!.invokeAsync({});
    expect(result.cells.get("b")!.knows()).toBe(Nothing);
  });

  test("a contradiction inside the sub-network propagates to the caller", async () => {
    // `conflicting` writes `out` from both double (10) and inc (6) → merge conflict
    // → the sub-run exits, which the leaf projects as a Contradiction upward.
    const result = await compiled.networks.get("outerConflict")!.invokeAsync({ a: 5 });
    expect(await settle(result.cells.get("b")!.knows())).toBeInstanceOf(Contradiction);
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
