import { valueEquals } from "../../src/info-structure.js";

// `valueEquals` is the single structural value-equality function the whole merge
// protocol routes through (Something.equals, MergeSet membership). It replaces the old
// `===` so that two structurally-identical records/arrays are equal even when they are
// distinct objects. Leaf rule is SameValueZero: NaN equals NaN (so `x ⊕ x` holds for
// NaN), and +0 equals -0.

describe("valueEquals: primitives (SameValueZero at the leaf)", () => {
  test("equal primitives", () => {
    expect(valueEquals(1, 1)).toBe(true);
    expect(valueEquals("a", "a")).toBe(true);
    expect(valueEquals(true, true)).toBe(true);
    expect(valueEquals(null, null)).toBe(true);
    expect(valueEquals(undefined, undefined)).toBe(true);
  });

  test("unequal primitives", () => {
    expect(valueEquals(1, 2)).toBe(false);
    expect(valueEquals("a", "b")).toBe(false);
    expect(valueEquals(1, "1")).toBe(false); // number vs string, no coercion
    expect(valueEquals(true, 1)).toBe(false);
    expect(valueEquals(null, undefined)).toBe(false);
  });

  test("NaN equals NaN (required for idempotency of a NaN-valued cell)", () => {
    expect(valueEquals(NaN, NaN)).toBe(true);
  });

  test("+0 and -0 are equal (SameValueZero, not Object.is)", () => {
    expect(valueEquals(0, -0)).toBe(true);
  });
});

describe("valueEquals: arrays (ordered, recursive)", () => {
  test("equal arrays by value, distinct references", () => {
    expect(valueEquals([1, 2, 3], [1, 2, 3])).toBe(true);
  });
  test("order matters", () => {
    expect(valueEquals([1, 2], [2, 1])).toBe(false);
  });
  test("length matters", () => {
    expect(valueEquals([1, 2], [1, 2, 3])).toBe(false);
  });
  test("nested arrays", () => {
    expect(valueEquals([[1], [2, 3]], [[1], [2, 3]])).toBe(true);
    expect(valueEquals([[1], [2, 3]], [[1], [2, 4]])).toBe(false);
  });
  test("arrays of records", () => {
    expect(valueEquals([{ v: 1 }, { v: 2 }], [{ v: 1 }, { v: 2 }])).toBe(true);
  });
});

describe("valueEquals: plain objects / records (key-set, order-insensitive, recursive)", () => {
  test("equal flat records, distinct references", () => {
    expect(valueEquals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
  });
  test("key order does not matter", () => {
    expect(valueEquals({ x: 1, y: 2 }, { y: 2, x: 1 })).toBe(true);
  });
  test("different value is not equal", () => {
    expect(valueEquals({ x: 1 }, { x: 2 })).toBe(false);
  });
  test("different key-set is not equal (extra / missing key)", () => {
    expect(valueEquals({ x: 1 }, { x: 1, y: 2 })).toBe(false);
    expect(valueEquals({ x: 1, y: 2 }, { x: 1 })).toBe(false);
  });
  test("the __type discriminant participates in equality", () => {
    expect(valueEquals({ __type: "A", v: 1 }, { __type: "A", v: 1 })).toBe(true);
    expect(valueEquals({ __type: "A", v: 1 }, { __type: "B", v: 1 })).toBe(false);
  });
  test("nested records", () => {
    expect(valueEquals({ p: { a: 1 } }, { p: { a: 1 } })).toBe(true);
    expect(valueEquals({ p: { a: 1 } }, { p: { a: 2 } })).toBe(false);
  });
});

describe("valueEquals: type mismatches and exotic objects", () => {
  test("object vs array vs primitive are all unequal", () => {
    expect(valueEquals({ 0: 1 }, [1])).toBe(false);
    expect(valueEquals([1], 1)).toBe(false);
    expect(valueEquals({ x: 1 }, 1)).toBe(false);
  });
  test("non-plain objects fall back to identity (no structural descent)", () => {
    const d1 = new Date(0);
    const d2 = new Date(0);
    expect(valueEquals(d1, d1)).toBe(true);  // same reference
    expect(valueEquals(d1, d2)).toBe(false); // equal-but-distinct exotic objects: identity only
  });
});
