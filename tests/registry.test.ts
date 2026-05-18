import { createRegistry } from "../src/registry.js";
import { Something, Nothing, Contradiction } from "../src/info-structure.js";

const add = (a: unknown, b: unknown) => (a as number) + (b as number);
const double = (a: unknown) => (a as number) * 2;

describe("registry: register and get", () => {
  test("registered entry is retrievable", () => {
    const registry = createRegistry();
    registry.register({ fnName: "add", impl: add, arity: 2, morphism: { from: ["number?", "number?"], to: "number?" } });
    const entry = registry.get("add");
    expect(entry).toBeDefined();
    expect(entry!.fnName).toBe("add");
    expect(entry!.arity).toBe(2);
  });

  test("get returns undefined for unknown name", () => {
    const registry = createRegistry();
    expect(registry.get("missing")).toBeUndefined();
  });

  test("registering same name overwrites", () => {
    const registry = createRegistry();
    registry.register({ fnName: "add", impl: add, arity: 2, morphism: { from: ["number?", "number?"], to: "number?" } });
    registry.register({ fnName: "add", impl: double, arity: 1, morphism: { from: ["number?"], to: "number?" } });
    expect(registry.get("add")!.arity).toBe(1);
  });
});

describe("registry: remove", () => {
  test("removed entry is no longer retrievable", () => {
    const registry = createRegistry();
    registry.register({ fnName: "add", impl: add, arity: 2, morphism: { from: ["number?", "number?"], to: "number?" } });
    registry.remove("add");
    expect(registry.get("add")).toBeUndefined();
  });

  test("removing unknown name is a no-op", () => {
    const registry = createRegistry();
    expect(() => registry.remove("missing")).not.toThrow();
  });
});

describe("registry: entries", () => {
  test("returns all registered entries", () => {
    const registry = createRegistry();
    registry.register({ fnName: "add", impl: add, arity: 2, morphism: { from: ["number?", "number?"], to: "number?" } });
    registry.register({ fnName: "double", impl: double, arity: 1, morphism: { from: ["number?"], to: "number?" } });
    expect(registry.entries().map(e => e.fnName).sort()).toEqual(["add", "double"]);
  });
});

describe("registry: unpacked", () => {
  test("unpacked is auto-computed and works on Somethings", () => {
    const registry = createRegistry();
    registry.register({ fnName: "add", impl: add, arity: 2, morphism: { from: ["number?", "number?"], to: "number?" } });
    const { unpacked } = registry.get("add")!;
    const result = unpacked(new Something(3), new Something(4));
    expect(result.equals(new Something(7))).toBe(true);
  });

  test("unpacked propagates Nothing", () => {
    const registry = createRegistry();
    registry.register({ fnName: "add", impl: add, arity: 2, morphism: { from: ["number?", "number?"], to: "number?" } });
    const { unpacked } = registry.get("add")!;
    expect(unpacked(Nothing, new Something(4))).toBe(Nothing);
  });

  test("unpacked propagates Contradiction", () => {
    const registry = createRegistry();
    registry.register({ fnName: "add", impl: add, arity: 2, morphism: { from: ["number?", "number?"], to: "number?" } });
    const { unpacked } = registry.get("add")!;
    const contra = new Contradiction("test", new Set());
    expect(unpacked(contra, new Something(4)) instanceof Contradiction).toBe(true);
  });
});
