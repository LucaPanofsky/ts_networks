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

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("equations: a + b = c", () => {
  const runtime = new NetworkRuntime(makeEquationNetwork(), makeRegistry());

  test("derives any unknown from the other two", () => {
    expect(runtime.invoke({ a: 2, b: 3 }).cells.get("c")!.knows()).toEqual(new Something(5));
    expect(runtime.invoke({ a: 2, c: 5 }).cells.get("b")!.knows()).toEqual(new Something(3));
    expect(runtime.invoke({ b: 3, c: 5 }).cells.get("a")!.knows()).toEqual(new Something(2));
  });

  test("inconsistent assignment produces contradiction (exit)", () => {
    expect(runtime.invoke({ a: 2, b: 3, c: 99 }).type).toBe("exit");
  });

  // ── Invariants ──────────────────────────────────────────────────────────────
  test("consistent full assignment does not produce contradiction", () => {
    expect(runtime.invoke({ a: 2, b: 3, c: 5 }).type).toBe("done");
  });

  test("each invocation is independent — no state leaks between calls", () => {
    runtime.invoke({ a: 2, b: 3 });
    expect(runtime.invoke({ a: 10, b: 20 }).cells.get("c")!.knows()).toEqual(new Something(30));
  });
});
