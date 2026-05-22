import { Hierarchy } from "../../src/data-network/hierarchy.js";

describe("Hierarchy.derive + isDerived", () => {
  test("direct parent relationship is derived", () => {
    const h = new Hierarchy<string>();
    h.derive("child", "parent");
    expect(h.isDerived("child", "parent")).toBe(true);
  });

  test("transitive relationship is derived", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    h.derive("c", "b");
    expect(h.isDerived("c", "a")).toBe(true);
  });

  test("unrelated nodes are not derived", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    expect(h.isDerived("a", "b")).toBe(false);
  });

  test("isDerived is true for equal values", () => {
    const h = new Hierarchy<string>();
    expect(h.isDerived("a", "a")).toBe(true);
  });

  test("throws when deriving from itself", () => {
    const h = new Hierarchy<string>();
    expect(() => h.derive("a", "a")).toThrow();
  });

  test("throws on direct cycle", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    expect(() => h.derive("a", "b")).toThrow();
  });

  test("throws on transitive cycle", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    h.derive("c", "b");
    expect(() => h.derive("a", "c")).toThrow();
  });
});

describe("Hierarchy.ancestors", () => {
  test("returns empty set for node with no parents", () => {
    const h = new Hierarchy<string>();
    expect(h.ancestors("a").size).toBe(0);
  });

  test("returns direct parent", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    expect(h.ancestors("b").has("a")).toBe(true);
  });

  test("returns all transitive ancestors", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    h.derive("c", "b");
    const ancs = h.ancestors("c");
    expect(ancs.has("a")).toBe(true);
    expect(ancs.has("b")).toBe(true);
    expect(ancs.size).toBe(2);
  });

  test("ancestors are stable across multiple calls", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    expect(h.ancestors("b")).toEqual(h.ancestors("b"));
  });

  test("ancestors reflect a new derive added after first call", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    h.ancestors("b"); // prime any cache
    h.derive("b", "z");
    expect(h.ancestors("b").has("z")).toBe(true);
  });
});

describe("Hierarchy.descendants", () => {
  test("returns empty set for leaf node", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    expect(h.descendants("b").size).toBe(0);
  });

  test("returns direct child", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    expect(h.descendants("a").has("b")).toBe(true);
  });

  test("returns all transitive descendants", () => {
    const h = new Hierarchy<string>();
    h.derive("b", "a");
    h.derive("c", "b");
    const desc = h.descendants("a");
    expect(desc.has("b")).toBe(true);
    expect(desc.has("c")).toBe(true);
    expect(desc.size).toBe(2);
  });
});
