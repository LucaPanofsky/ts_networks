import { MergeObject } from "../../src/information-structures/merge-object.js";
import { Something, Nothing, I, Contradiction } from "../../src/info-structure.js";
import { naryUnpacking } from "../../src/nary-unpacking.js";

describe("MergeObject.lift: structure of lifted fields", () => {
  test("string field becomes Something", () => {
    const m = MergeObject.lift({ foo: "hello" });
    expect(m.fields()["foo"]!.equals(new Something("hello"))).toBe(true);
  });

  test("number field becomes Something", () => {
    const m = MergeObject.lift({ n: 42 });
    expect(m.fields()["n"]!.equals(new Something(42))).toBe(true);
  });

  test("null field becomes Nothing", () => {
    const m = MergeObject.lift({ x: null });
    expect(m.fields()["x"]).toBe(Nothing);
  });

  test("array field becomes Something (not recursively lifted)", () => {
    const arr = [1, 2, 3];
    const m = MergeObject.lift({ arr });
    expect(m.fields()["arr"]!.equals(new Something(arr))).toBe(true);
  });

  test("nested object becomes a MergeObject", () => {
    const m = MergeObject.lift({ inner: { bar: 1 } });
    expect(m.fields()["inner"] instanceof MergeObject).toBe(true);
  });

  test("nested object fields are correctly lifted", () => {
    const m = MergeObject.lift({ inner: { bar: 1 } });
    const inner = m.fields()["inner"] as MergeObject;
    expect(inner.fields()["bar"]!.equals(new Something(1))).toBe(true);
  });

  test("deeply nested object is fully lifted", () => {
    const m = MergeObject.lift({ a: { b: { c: "deep" } } });
    const ab = (m.fields()["a"] as MergeObject).fields()["b"] as MergeObject;
    expect(ab.fields()["c"]!.equals(new Something("deep"))).toBe(true);
  });
});

describe("MergeObject.content: plain object unwrap", () => {
  test("primitive fields are unwrapped to plain values", () => {
    const m = MergeObject.lift({ foo: "hello", n: 42 });
    expect(m.content()).toEqual({ foo: "hello", n: 42 });
  });

  test("null field unwraps to undefined (Nothing.content())", () => {
    const m = MergeObject.lift({ x: null });
    expect(m.content()["x"]).toBeUndefined();
  });

  test("array field unwraps to the original array", () => {
    const arr = [1, 2, 3];
    const m = MergeObject.lift({ arr });
    expect(m.content()["arr"]).toBe(arr);
  });

  test("nested object unwraps recursively to a plain object", () => {
    const m = MergeObject.lift({ inner: { bar: 1 } });
    expect(m.content()).toEqual({ inner: { bar: 1 } });
  });

  test("deeply nested object unwraps fully", () => {
    const m = MergeObject.lift({ a: { b: { c: "deep" } } });
    expect(m.content()).toEqual({ a: { b: { c: "deep" } } });
  });
});

describe("MergeObject: I() idempotence", () => {
  test("I(mergeObject) returns the same object", () => {
    const m = MergeObject.lift({ x: 1 });
    expect(I(m)).toBe(m);
  });
});

function incrementXY(obj: Record<string, unknown>): MergeObject {
  return MergeObject.lift({ x: (obj.x as number) + 1, y: (obj.y as number) + 1 });
}

const combineXY = naryUnpacking(
  (a: unknown, b: unknown) => {
    const x = (a as Record<string, unknown>).x as number;
    const y = (b as Record<string, unknown>).y as number;
    return MergeObject.lift({ out: x + y });
  },
  2,
);

describe("MergeObject with naryUnpacking", () => {
  test("combines two MergeObject inputs into a MergeObject output", () => {
    const result = combineXY(MergeObject.lift({ x: 1 }), MergeObject.lift({ y: 2 }));
    expect(result instanceof MergeObject).toBe(true);
    expect((result as MergeObject).content()).toEqual({ out: 3 });
  });

  test("same result when inputs are wrapped with I instead of MergeObject.lift", () => {
    const result = combineXY(I({ x: 1 }), I({ y: 2 }));
    expect(result instanceof MergeObject).toBe(true);
    expect((result as MergeObject).content()).toEqual({ out: 3 });
  });
});

describe("MergeObject.bind", () => {
  test("bind applies incrementXY and re-lifts the result", () => {
    const m = MergeObject.lift({ x: 1, y: 2 });
    const result = m.bind(incrementXY);
    expect(result instanceof MergeObject).toBe(true);
    expect((result as MergeObject).content()).toEqual({ x: 2, y: 3 });
  });
});

describe("MergeObject.merge", () => {
  test("merge with Nothing returns this", () => {
    const m = MergeObject.lift({ x: 1 });
    expect(m.merge(Nothing)).toBe(m);
  });

  test("merge two disjoint MergeObjects unions their keys", () => {
    const a = MergeObject.lift({ x: 1 });
    const b = MergeObject.lift({ y: 2 });
    const result = a.merge(b) as MergeObject;
    expect(result instanceof MergeObject).toBe(true);
    expect(result.content()).toEqual({ x: 1, y: 2 });
  });

  test("merge two overlapping MergeObjects with same values", () => {
    const a = MergeObject.lift({ x: 1, y: 2 });
    const b = MergeObject.lift({ x: 1, z: 3 });
    const result = a.merge(b) as MergeObject;
    expect(result.content()).toEqual({ x: 1, y: 2, z: 3 });
  });

  test("merge conflicting field values produces Contradiction", () => {
    const a = MergeObject.lift({ x: 1 });
    const b = MergeObject.lift({ x: 2 });
    const result = a.merge(b);
    expect(result instanceof Contradiction).toBe(true);
  });

  test("merge with Something produces Contradiction", () => {
    const m = MergeObject.lift({ x: 1 });
    expect(m.merge(new Something(42)) instanceof Contradiction).toBe(true);
  });

  test("merge with Contradiction returns the Contradiction", () => {
    const m = MergeObject.lift({ x: 1 });
    const c = new Contradiction("test", new Set());
    expect(m.merge(c)).toBe(c);
  });
});

describe("MergeObject.equals", () => {
  test("two lifts of the same flat object are equal", () => {
    const a = MergeObject.lift({ x: 1, y: "hi" });
    const b = MergeObject.lift({ x: 1, y: "hi" });
    expect(a.equals(b)).toBe(true);
  });

  test("different values are not equal", () => {
    const a = MergeObject.lift({ x: 1 });
    const b = MergeObject.lift({ x: 2 });
    expect(a.equals(b)).toBe(false);
  });

  test("different keys are not equal", () => {
    const a = MergeObject.lift({ x: 1 });
    const b = MergeObject.lift({ y: 1 });
    expect(a.equals(b)).toBe(false);
  });

  test("nested equality holds", () => {
    const a = MergeObject.lift({ inner: { v: 10 } });
    const b = MergeObject.lift({ inner: { v: 10 } });
    expect(a.equals(b)).toBe(true);
  });

  test("not equal to Something", () => {
    const m = MergeObject.lift({ x: 1 });
    expect(m.equals(new Something({ x: 1 }))).toBe(false);
  });
});
