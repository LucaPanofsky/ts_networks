import { DataNetwork } from "../../src/data-network/index.js";

describe("DataNetwork", () => {
  describe("addCell", () => {
    it("creates a cell with default values", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addCell("x");
      const cell = net.cells.get("x");
      expect(cell).toBeDefined();
      expect(cell!.name).toBe("x");
      expect(cell!.content).toBeUndefined();
      expect(cell!.defaultContent).toBeUndefined();
      expect(cell!.isConstant).toBe(false);
      expect(cell!.neighbors).toEqual(new Set());
    });

    it("creates a cell with explicit content, defaultContent, and isConstant", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addCell("k", { content: 42, defaultContent: 42, isConstant: true });
      const cell = net.cells.get("k");
      expect(cell!.content).toBe(42);
      expect(cell!.defaultContent).toBe(42);
      expect(cell!.isConstant).toBe(true);
    });

    it("is idempotent — second call does not overwrite", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addCell("x", { content: 99 });
      net.addCell("x", { content: 0 });
      expect(net.cells.get("x")!.content).toBe(99);
    });

    it("returns this for chaining", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      expect(net.addCell("x")).toBe(net);
    });
  });

  describe("addPropagator", () => {
    it("generates name as fn__a__b__to__c", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addPropagator("myFn", ["a", "b"], "c");
      expect(net.propagators.has("myFn__a__b__to__c")).toBe(true);
    });

    it("stores fn, from, to, and params on the propagator", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addPropagator("f", ["x"], "y", { mode: "fast" });
      const p = net.propagators.get("f__x__to__y")!;
      expect(p.fn).toBe("f");
      expect(p.from).toEqual(["x"]);
      expect(p.to).toBe("y");
      expect(p.params).toEqual({ mode: "fast" });
    });

    it("defaults params to empty object", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addPropagator("f", ["x"], "y");
      expect(net.propagators.get("f__x__to__y")!.params).toEqual({});
    });

    it("auto-creates missing input and output cells", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addPropagator("f", ["a", "b"], "z");
      expect(net.cells.has("a")).toBe(true);
      expect(net.cells.has("b")).toBe(true);
      expect(net.cells.has("z")).toBe(true);
    });

    it("registers propagator name in neighbors of each input cell", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addPropagator("f", ["a", "b"], "c");
      expect(net.cells.get("a")!.neighbors).toContain("f__a__b__to__c");
      expect(net.cells.get("b")!.neighbors).toContain("f__a__b__to__c");
    });

    it("does not register propagator in neighbors of output cell", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      net.addPropagator("f", ["a"], "c");
      expect(net.cells.get("c")!.neighbors).not.toContain("f__a__to__c");
    });

    it("returns this for chaining", () => {
      const net = new DataNetwork("test", { from: [], to: "out" });
      expect(net.addPropagator("f", ["x"], "y")).toBe(net);
    });

    it("method chaining works end-to-end", () => {
      const net = new DataNetwork("test", { from: ["x"], to: "y" });
      net.addCell("x", { content: 1 }).addCell("y").addPropagator("id", ["x"], "y");
      expect(net.cells.size).toBe(2);
      expect(net.propagators.size).toBe(1);
    });
  });
});
