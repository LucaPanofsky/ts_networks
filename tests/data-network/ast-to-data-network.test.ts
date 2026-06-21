import { astToDataNetwork } from "../../src/data-network/index.js";
import type { NetworkNode } from "../../src/language/constructs/defnetwork/ast.js";
import { ConstructKind } from "../../src/language/core/enums.js";

const base: NetworkNode = {
  kind: ConstructKind.Network,
  name: "myNet",
  signature: { from: ["a", "b"], to: "out" },
  terms: [],
};

describe("astToDataNetwork", () => {
  it("copies name and signature", () => {
    const net = astToDataNetwork(base);
    expect(net.name).toBe("myNet");
    expect(net.signature).toEqual({ from: ["a", "b"], to: "out" });
  });

  it("CellTerm creates a cell with content and defaultContent", () => {
    const net = astToDataNetwork({ ...base, terms: [{ kind: "cell", name: "x", value: "hello" }] });
    const cell = net.cells.get("x")!;
    expect(cell.content).toBe("hello");
    expect(cell.defaultContent).toBe("hello");
    expect(cell.isConstant).toBe(false);
  });

  it("CellTerm coerces integer value", () => {
    const net = astToDataNetwork({ ...base, terms: [{ kind: "cell", name: "n", value: "42" }] });
    expect(net.cells.get("n")!.content).toBe(42);
    expect(net.cells.get("n")!.defaultContent).toBe(42);
  });

  it("CellTerm coerces boolean values", () => {
    const trueNet = astToDataNetwork({ ...base, terms: [{ kind: "cell", name: "flag", value: "true" }] });
    expect(trueNet.cells.get("flag")!.content).toBe(true);
    const falseNet = astToDataNetwork({ ...base, terms: [{ kind: "cell", name: "flag", value: "false" }] });
    expect(falseNet.cells.get("flag")!.content).toBe(false);
  });

  it("ConstantTerm creates a cell with isConstant true", () => {
    const net = astToDataNetwork({ ...base, terms: [{ kind: "constant", name: "k", value: "99" }] });
    const cell = net.cells.get("k")!;
    expect(cell.content).toBe(99);
    expect(cell.isConstant).toBe(true);
  });

  it("PropagateTerm adds a propagator with correct shape", () => {
    const net = astToDataNetwork({ ...base, terms: [{ kind: "propagate", fn: "add", from: ["a", "b"], to: "c", params: {} }] });
    const p = net.propagators.get("add__a__b__to__c")!;
    expect(p.fn).toBe("add");
    expect(p.from).toEqual(["a", "b"]);
    expect(p.to).toBe("c");
  });

  it("PropagateTerm passes params", () => {
    const net = astToDataNetwork({ ...base, terms: [{ kind: "propagate", fn: "f", from: ["x"], to: "y", params: { mode: "fast" } }] });
    expect(net.propagators.get("f__x__to__y")!.params).toEqual({ mode: "fast" });
  });

  it("SwitchTerm adds a propagator with fn __SWITCH", () => {
    const net = astToDataNetwork({ ...base, terms: [{ kind: "switch", fn: null, from: ["a", "b"], to: "c" }] });
    expect(net.propagators.get("__SWITCH__a__b__to__c")!.fn).toBe("__SWITCH");
  });

  it("auto-created cells have undefined defaultContent", () => {
    const net = astToDataNetwork({ ...base, terms: [{ kind: "propagate", fn: "f", from: ["x"], to: "y", params: {} }] });
    expect(net.cells.get("x")!.defaultContent).toBeUndefined();
  });

  it("CellTerm declaration wins over auto-creation by propagator", () => {
    const net = astToDataNetwork({
      ...base,
      terms: [
        { kind: "cell", name: "x", value: "10" },
        { kind: "propagate", fn: "f", from: ["x"], to: "y", params: {} },
      ],
    });
    expect(net.cells.get("x")!.content).toBe(10);
  });

  it("self-referencing propagator is marked __RECURSIVE with network name in params", () => {
    const net = astToDataNetwork({ ...base, name: "myNet", terms: [{ kind: "propagate", fn: "myNet", from: ["x"], to: "y", params: {} }] });
    const [p] = net.propagators.values();
    expect(p!.fn).toBe("__RECURSIVE");
    expect(p!.params.network).toBe("myNet");
  });

  it("non-self propagator is not marked __RECURSIVE", () => {
    const net = astToDataNetwork({ ...base, name: "myNet", terms: [{ kind: "propagate", fn: "otherFn", from: ["x"], to: "y", params: {} }] });
    expect([...net.propagators.values()][0]!.fn).toBe("otherFn");
  });
});
