import { MergeSet } from "../../src/information-structures/merge-set.js";
import { Something, Nothing, I, Contradiction } from "../../src/info-structure.js";
import { MergeObject } from "../../src/information-structures/merge-object.js";
import { naryUnpacking } from "../../src/nary-unpacking.js";

const asSet = (x: unknown) => new Set(x as unknown[]);

describe("MergeSet.lift / content / elements", () => {
  test("lift collects the values; content returns them as an array", () => {
    const m = MergeSet.lift([1, 2, 3]);
    expect(asSet(m.content())).toEqual(new Set([1, 2, 3]));
  });

  test("duplicate values are collapsed (set semantics)", () => {
    const m = MergeSet.lift([1, 1, 2, 2, 2]);
    expect(m.elements().length).toBe(2);
    expect(asSet(m.content())).toEqual(new Set([1, 2]));
  });

  test("I(mergeSet) returns the same object (idempotence)", () => {
    const m = MergeSet.lift([1, 2]);
    expect(I(m)).toBe(m);
  });
});

describe("MergeSet.equals", () => {
  test("equality is order-independent", () => {
    expect(MergeSet.lift([1, 2, 3]).equals(MergeSet.lift([3, 1, 2]))).toBe(true);
  });

  test("different elements are not equal", () => {
    expect(MergeSet.lift([1, 2]).equals(MergeSet.lift([1, 3]))).toBe(false);
  });

  test("different sizes are not equal", () => {
    expect(MergeSet.lift([1, 2]).equals(MergeSet.lift([1, 2, 3]))).toBe(false);
  });

  test("not equal to a Something", () => {
    expect(MergeSet.lift([1]).equals(new Something([1]))).toBe(false);
  });
});

describe("MergeSet.merge: intersection", () => {
  test("merge intersects the two sets", () => {
    const r = MergeSet.lift([1, 2, 3]).merge(MergeSet.lift([2, 3, 4]));
    expect(r instanceof MergeSet).toBe(true);
    expect(asSet((r as MergeSet).content())).toEqual(new Set([2, 3]));
  });

  test("empty intersection becomes a Contradiction", () => {
    const r = MergeSet.lift([1, 2]).merge(MergeSet.lift([3, 4]));
    expect(r instanceof Contradiction).toBe(true);
  });

  test("merge with Nothing returns this", () => {
    const m = MergeSet.lift([1, 2]);
    expect(m.merge(Nothing)).toBe(m);
  });

  test("merge with a Contradiction returns the Contradiction", () => {
    const m = MergeSet.lift([1, 2]);
    const c = new Contradiction("test", new Set());
    expect(m.merge(c)).toBe(c);
  });

  test("merge with a Something is a type conflict (Contradiction)", () => {
    expect(MergeSet.lift([1]).merge(new Something(1)) instanceof Contradiction).toBe(true);
  });

  test("merge with a MergeObject is a type conflict, with no infinite delegation", () => {
    expect(MergeSet.lift([1]).merge(MergeObject.lift({ x: 1 })) instanceof Contradiction).toBe(true);
    // and the reverse direction also terminates
    expect(MergeObject.lift({ x: 1 }).merge(MergeSet.lift([1])) instanceof Contradiction).toBe(true);
  });

  test("intersection is commutative", () => {
    const a = MergeSet.lift([1, 2, 3]);
    const b = MergeSet.lift([2, 3, 4]);
    expect((a.merge(b) as MergeSet).equals(b.merge(a) as MergeSet)).toBe(true);
  });

  test("intersection is idempotent", () => {
    const a = MergeSet.lift([1, 2, 3]);
    expect((a.merge(a) as MergeSet).equals(a)).toBe(true);
  });
});

describe("MergeSet.unpack / flatten", () => {
  test("unpack maps f over each element", () => {
    const r = MergeSet.lift([1, 2, 3]).unpack(e => I((e as number) * 10)) as MergeSet;
    // unpack's result holds the per-element InfoStructures; flatten normalizes them
    expect(asSet((r.flatten() as MergeSet).content())).toEqual(new Set([10, 20, 30]));
  });

  test("flatten drops Nothing branches", () => {
    const r = new MergeSet([new Something(1), Nothing, new Something(2)]).flatten() as MergeSet;
    expect(asSet(r.content())).toEqual(new Set([1, 2]));
  });

  test("flatten aborts the whole set on a Contradiction branch", () => {
    const r = new MergeSet([new Something(1), new Contradiction("x", new Set())]).flatten();
    expect(r instanceof Contradiction).toBe(true);
  });

  test("flatten unions nested MergeSets", () => {
    const r = new MergeSet([MergeSet.lift([1, 2]), MergeSet.lift([2, 3])]).flatten() as MergeSet;
    expect(asSet(r.content())).toEqual(new Set([1, 2, 3]));
  });

  test("flatten of an all-dropped set is a Contradiction (empty domain)", () => {
    expect(new MergeSet([Nothing, Nothing]).flatten() instanceof Contradiction).toBe(true);
  });

  test("flatten descends into arbitrarily nested MergeSets, normalizing inner branches", () => {
    const nested = new MergeSet([
      new MergeSet([new Something(1), new MergeSet([new Something(2)])]),
      new Something(3),
    ]);
    expect(asSet((nested.flatten() as MergeSet).content())).toEqual(new Set([1, 2, 3]));
  });

  test("flatten propagates a Contradiction buried in a nested MergeSet", () => {
    const nested = new MergeSet([new MergeSet([new Contradiction("x", new Set())]), new Something(1)]);
    expect(nested.flatten() instanceof Contradiction).toBe(true);
  });

  test("a nested empty MergeSet drops as a branch rather than killing the union", () => {
    const nested = new MergeSet([new MergeSet([]), new Something(1)]);
    expect(asSet((nested.flatten() as MergeSet).content())).toEqual(new Set([1]));
  });
});

describe("MergeSet with naryUnpacking", () => {
  test("arity-1 maps the function elementwise over the set", () => {
    const dbl = naryUnpacking((x: unknown) => (x as number) * 2, 1);
    const r = dbl(MergeSet.lift([1, 2, 3])) as MergeSet;
    expect(asSet(r.content())).toEqual(new Set([2, 4, 6]));
  });

  test("arity-2 over two MergeSets yields the Cartesian product", () => {
    const add = naryUnpacking((x: unknown, y: unknown) => (x as number) + (y as number), 2);
    const r = add(MergeSet.lift([1, 2]), MergeSet.lift([10, 20])) as MergeSet;
    expect(asSet(r.content())).toEqual(new Set([11, 21, 12, 22]));
  });
});
