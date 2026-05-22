import { astToDataNetwork } from "../../src/data-network/index.js";
import type { DataNetworkAST } from "../../src/data-network/index.js";

const base: DataNetworkAST = {
  kind: "network",
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

  it("CellTerm creates a cell with string content and defaultContent", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "cell", name: "x", value: "hello" }],
    };
    const net = astToDataNetwork(ast);
    const cell = net.cells.get("x")!;
    expect(cell.content).toBe("hello");
    expect(cell.defaultContent).toBe("hello");
    expect(cell.isConstant).toBe(false);
  });

  it("CellTerm coerces integer value", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "cell", name: "n", value: "42" }],
    };
    const net = astToDataNetwork(ast);
    const cell = net.cells.get("n")!;
    expect(cell.content).toBe(42);
    expect(cell.defaultContent).toBe(42);
  });

  it("CellTerm coerces boolean true", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "cell", name: "flag", value: "true" }],
    };
    const net = astToDataNetwork(ast);
    const cell = net.cells.get("flag")!;
    expect(cell.content).toBe(true);
    expect(cell.defaultContent).toBe(true);
  });

  it("CellTerm coerces boolean false", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "cell", name: "flag", value: "false" }],
    };
    const net = astToDataNetwork(ast);
    const cell = net.cells.get("flag")!;
    expect(cell.content).toBe(false);
    expect(cell.defaultContent).toBe(false);
  });

  it("ConstantTerm creates a cell with isConstant true", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "constant", name: "k", value: "99" }],
    };
    const net = astToDataNetwork(ast);
    const cell = net.cells.get("k")!;
    expect(cell.content).toBe(99);
    expect(cell.defaultContent).toBe(99);
    expect(cell.isConstant).toBe(true);
  });

  it("PropagateTerm adds a propagator", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "propagate", fn: "add", from: ["a", "b"], to: "c", params: {} }],
    };
    const net = astToDataNetwork(ast);
    expect(net.propagators.has("add__a__b__to__c")).toBe(true);
    const p = net.propagators.get("add__a__b__to__c")!;
    expect(p.fn).toBe("add");
    expect(p.from).toEqual(["a", "b"]);
    expect(p.to).toBe("c");
  });

  it("PropagateTerm passes params", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "propagate", fn: "f", from: ["x"], to: "y", params: { mode: "fast" } }],
    };
    const net = astToDataNetwork(ast);
    expect(net.propagators.get("f__x__to__y")!.params).toEqual({ mode: "fast" });
  });

  it("SwitchTerm adds a propagator with fn __SWITCH", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "switch", fn: null, from: ["a", "b"], to: "c" }],
    };
    const net = astToDataNetwork(ast);
    expect(net.propagators.has("__SWITCH__a__b__to__c")).toBe(true);
    expect(net.propagators.get("__SWITCH__a__b__to__c")!.fn).toBe("__SWITCH");
  });

  it("auto-created cells have undefined defaultContent", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [{ kind: "propagate", fn: "f", from: ["x"], to: "y", params: {} }],
    };
    const net = astToDataNetwork(ast);
    expect(net.cells.get("x")!.defaultContent).toBeUndefined();
    expect(net.cells.get("y")!.defaultContent).toBeUndefined();
  });

  it("CellTerm declaration wins over auto-creation by propagator", () => {
    const ast: DataNetworkAST = {
      ...base,
      terms: [
        { kind: "cell", name: "x", value: "10" },
        { kind: "propagate", fn: "f", from: ["x"], to: "y", params: {} },
      ],
    };
    const net = astToDataNetwork(ast);
    expect(net.cells.get("x")!.content).toBe(10);
    expect(net.cells.get("x")!.defaultContent).toBe(10);
  });
});
