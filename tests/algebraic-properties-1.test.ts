import { Nothing, Something, Contradiction } from "../src/info-structure.js";
import type { InfoStructure } from "../src/info-structure.js";

const nothing = Nothing;
const s42 = new Something(42);
const s99 = new Something(99);
const contra = new Contradiction("test", new Set());

const named: [string, InfoStructure<unknown>][] = [
  ["Nothing", nothing],
  ["Something(42)", s42],
  ["Something(99)", s99],
  ["Contradiction", contra],
];

describe("merge: idempotent (a ⊕ a = a)", () => {
  test.each(named)("%s", (_name, a) => {
    expect(a.merge(a).equals(a)).toBe(true);
  });
});

describe("merge: commutative (a ⊕ b = b ⊕ a)", () => {
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const [nameA, a] = named[i]!;
      const [nameB, b] = named[j]!;
      test(`${nameA} ⊕ ${nameB}`, () => {
        const ab = a.merge(b);
        const ba = b.merge(a);
        expect(ab.equals(ba)).toBe(true);
        expect(ba.equals(ab)).toBe(true);
      });
    }
  }
});

describe("merge: associative ((a ⊕ b) ⊕ c = a ⊕ (b ⊕ c))", () => {
  for (let i = 0; i < named.length; i++) {
    for (let j = 0; j < named.length; j++) {
      for (let k = 0; k < named.length; k++) {
        const [nameA, a] = named[i]!;
        const [nameB, b] = named[j]!;
        const [nameC, c] = named[k]!;
        test(`(${nameA} ⊕ ${nameB}) ⊕ ${nameC}`, () => {
          const lhs = a.merge(b).merge(c);
          const rhs = a.merge(b.merge(c));
          expect(lhs.equals(rhs)).toBe(true);
        });
      }
    }
  }
});
