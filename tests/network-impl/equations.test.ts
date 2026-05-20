import { DataNetwork } from "../../src/data-network/data-network.js";
import { createRegistry } from "../../src/registry.js";
import { NetworkRuntime } from "../../src/network-impl/runtime.js";
import { Something } from "../../src/info-structure.js";

function makeEquationNetwork() {
  const net = new DataNetwork("abc", { from: ["a", "b"], to: "c" });
  net.addPropagator("add", ["a", "b"], "c");
  net.addPropagator("sub", ["c", "a"], "b");
  net.addPropagator("sub", ["c", "b"], "a");
  return net;
}

function makeRegistry() {
  const reg = createRegistry();
  reg.register({ fnName: "add", arity: 2, impl: (a, b) => (a as number) + (b as number), morphism: { from: ["number", "number"], to: "number" } });
  reg.register({ fnName: "sub", arity: 2, impl: (a, b) => (a as number) - (b as number), morphism: { from: ["number", "number"], to: "number" } });
  return reg;
}

describe("equations: a + b = c", () => {
  const runtime = new NetworkRuntime(makeEquationNetwork(), makeRegistry());

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

  test("consistent full assignment does not produce contradiction", () => {
    const result = runtime.invoke({ a: 2, b: 3, c: 5 });
    expect(result.type).toBe("done");
  });

  test("inconsistent assignment produces contradiction", () => {
    const result = runtime.invoke({ a: 2, b: 3, c: 99 });
    expect(result.type).toBe("exit");
  });

  test("each invocation is independent", () => {
    runtime.invoke({ a: 2, b: 3 });
    const result = runtime.invoke({ a: 10, b: 20 });
    expect(result.cells.get("c")!.knows()).toEqual(new Something(30));
  });
});
