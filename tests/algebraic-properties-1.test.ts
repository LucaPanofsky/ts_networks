import { Nothing, Something, Contradiction } from "../src/info-structure.js";
import type { InfoStructure } from "../src/info-structure.js";

const nothing = Nothing;
const s42 = new Something(42);
const s99 = new Something(99);
const contra = new Contradiction("test", new Set());

const all: InfoStructure<unknown>[] = [nothing, s42, s99, contra];

describe("merge: idempotent (a ⊕ a = a)", () => {
  test.each([
    ["Nothing", nothing],
    ["Something(42)", s42],
    ["Contradiction", contra],
  ])("%s", (_name, a) => {
    expect(a.merge(a).equals(a)).toBe(true);
  });
});

describe("merge: commutative (a ⊕ b = b ⊕ a)", () => {
  for (const [nameA, a] of all.entries()) {
    for (const [nameB, b] of all.entries()) {
      if (nameB <= nameA) continue;
      test(`all[${nameA}] ⊕ all[${nameB}]`, () => {
        const ab = a.merge(b);
        const ba = b.merge(a);
        expect(ab.equals(ba)).toBe(true);
        expect(ba.equals(ab)).toBe(true);
      });
    }
  }
});

describe("merge: associative ((a ⊕ b) ⊕ c = a ⊕ (b ⊕ c))", () => {
  for (const [nameA, a] of all.entries()) {
    for (const [nameB, b] of all.entries()) {
      for (const [nameC, c] of all.entries()) {
        test(`all[${nameA}] ⊕ all[${nameB}] ⊕ all[${nameC}]`, () => {
          const lhs = a.merge(b).merge(c);
          const rhs = a.merge(b.merge(c));
          expect(lhs.equals(rhs)).toBe(true);
        });
      }
    }
  }
});
