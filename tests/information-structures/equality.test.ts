import { Nothing, Something, Contradiction, type InfoStructure } from "../../src/info-structure.js";
import { MergeObject } from "../../src/information-structures/merge-object.js";
import { MergeSet } from "../../src/information-structures/merge-set.js";

// The merge protocol must use VALUE equality, not reference equality. This suite is the
// executable version of report/equality.md: the empirical table (which previously showed
// spurious Contradictions on equal-but-distinct objects) plus the monoid laws over object
// values, which the old `===`-based equals violated.

const isC = (x: InfoStructure<unknown>) => x instanceof Contradiction;

describe("equality report table — equal-but-distinct values merge, not contradict", () => {
  test("1. two structurally-equal records (default Something path) merge", () => {
    const r = new Something({ x: 1 }).merge(new Something({ x: 1 }));
    expect(isC(r)).toBe(false);
    expect(r.content()).toEqual({ x: 1 });
  });

  test("3. MergeObject with an array field merges (array leaf compared by value)", () => {
    const r = MergeObject.lift({ xs: [1, 2] }).merge(MergeObject.lift({ xs: [1, 2] }));
    expect(isC(r)).toBe(false);
    expect((r as MergeObject).content()).toEqual({ xs: [1, 2] });
  });

  test("4. MergeObject with a nested-object field merges", () => {
    const r = MergeObject.lift({ p: { a: 1 } }).merge(MergeObject.lift({ p: { a: 1 } }));
    expect(isC(r)).toBe(false);
    expect((r as MergeObject).content()).toEqual({ p: { a: 1 } });
  });

  test("6. Something(NaN) ⊕ Something(NaN) merges (NaN is self-equal)", () => {
    const r = new Something(NaN).merge(new Something(NaN));
    expect(isC(r)).toBe(false);
    expect(Number.isNaN(r.content())).toBe(true);
  });

  test("7. MergeSet of equal-but-distinct records intersects to that element", () => {
    const r = MergeSet.lift([{ v: 1 }]).merge(MergeSet.lift([{ v: 1 }]));
    expect(isC(r)).toBe(false);
    expect((r as MergeSet).content()).toEqual([{ v: 1 }]);
  });
});

describe("genuine conflicts still contradict (the fix must not over-merge)", () => {
  test("different records contradict", () => {
    expect(isC(new Something({ x: 1 }).merge(new Something({ x: 2 })))).toBe(true);
  });
  test("record vs primitive contradicts", () => {
    expect(isC(new Something({ x: 1 }).merge(new Something(1)))).toBe(true);
  });
  test("MergeObject conflicting field contradicts", () => {
    expect(isC(MergeObject.lift({ x: 1 }).merge(MergeObject.lift({ x: 2 })))).toBe(true);
  });
  test("MergeSet of disjoint records contradicts (empty intersection)", () => {
    expect(isC(MergeSet.lift([{ v: 1 }]).merge(MergeSet.lift([{ v: 2 }])))).toBe(true);
  });
});

// ── Monoid laws over OBJECT values (the part the old equals broke) ─────────────
const objVals: [string, () => InfoStructure<unknown>][] = [
  ["Nothing", () => Nothing],
  ["Something(record)", () => new Something({ x: 1, __type: "P" })],
  ["Something(array)", () => new Something([1, 2, 3])],
  ["Something(NaN)", () => new Something(NaN)],
  ["MergeObject", () => MergeObject.lift({ x: 1, y: 2 })],
  ["MergeSet(records)", () => MergeSet.lift([{ v: 1 }, { v: 2 }])],
  ["Contradiction", () => new Contradiction("t", new Set())],
];

describe("law: idempotent (a ⊕ a = a) for object values", () => {
  test.each(objVals)("%s", (_n, mk) => {
    const a = mk();
    // a fresh, structurally-equal copy on each side — the real-world case (re-derivation)
    expect(mk().merge(mk()).equals(a)).toBe(true);
  });
});

describe("law: commutative (a ⊕ b = b ⊕ a) for object values", () => {
  for (let i = 0; i < objVals.length; i++) {
    for (let j = i + 1; j < objVals.length; j++) {
      const [na, mka] = objVals[i]!;
      const [nb, mkb] = objVals[j]!;
      test(`${na} ⊕ ${nb}`, () => {
        expect(mka().merge(mkb()).equals(mkb().merge(mka()))).toBe(true);
      });
    }
  }
});

describe("law: associative ((a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)) for object values", () => {
  for (let i = 0; i < objVals.length; i++) {
    for (let j = 0; j < objVals.length; j++) {
      for (let k = 0; k < objVals.length; k++) {
        const [na, mka] = objVals[i]!;
        const [nb, mkb] = objVals[j]!;
        const [nc, mkc] = objVals[k]!;
        test(`(${na} ⊕ ${nb}) ⊕ ${nc}`, () => {
          const lhs = mka().merge(mkb()).merge(mkc());
          const rhs = mka().merge(mkb().merge(mkc()));
          expect(lhs.equals(rhs)).toBe(true);
        });
      }
    }
  }
});
