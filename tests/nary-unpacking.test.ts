import { Nothing, Something, Contradiction } from "../src/info-structure.js";
import { naryUnpacking, naryUnpackingDissertation } from "../src/nary-unpacking.js";

const add = (a: unknown, b: unknown) => (a as number) + (b as number);
const concat = (a: unknown, b: unknown, c: unknown) => `${a}${b}${c}`;

describe("naryUnpacking: binary function", () => {
  test("two Somethings → Something with result", () => {
    const result = naryUnpacking(add, 2)(new Something(1), new Something(2));
    expect(result.equals(new Something(3))).toBe(true);
  });

  test("first arg is Nothing → Nothing", () => {
    expect(naryUnpacking(add, 2)(Nothing, new Something(2))).toBe(Nothing);
  });

  test("second arg is Nothing → Nothing", () => {
    expect(naryUnpacking(add, 2)(new Something(1), Nothing)).toBe(Nothing);
  });

  test("first arg is Contradiction → Contradiction", () => {
    const contra = new Contradiction("test", new Set());
    expect(naryUnpacking(add, 2)(contra, new Something(2)) instanceof Contradiction).toBe(true);
  });
});

describe("naryUnpacking: ternary function", () => {
  test("three Somethings → Something with result", () => {
    const result = naryUnpacking(concat, 3)(new Something("a"), new Something("b"), new Something("c"));
    expect(result.equals(new Something("abc"))).toBe(true);
  });

  test("any arg is Nothing → Nothing", () => {
    expect(naryUnpacking(concat, 3)(new Something("a"), Nothing, new Something("c"))).toBe(Nothing);
  });
});

describe("naryUnpacking: arity > 5 throws", () => {
  test("throws for arity 6", () => {
    expect(() => naryUnpacking(add, 6)).toThrow();
  });
});

describe("naryUnpackingDissertation: binary function", () => {
  test("two Somethings → Something with result", () => {
    const result = naryUnpackingDissertation(add)(new Something(1), new Something(2));
    expect(result.equals(new Something(3))).toBe(true);
  });

  test("first arg is Nothing → Nothing", () => {
    expect(naryUnpackingDissertation(add)(Nothing, new Something(2))).toBe(Nothing);
  });

  test("second arg is Nothing → Nothing", () => {
    expect(naryUnpackingDissertation(add)(new Something(1), Nothing)).toBe(Nothing);
  });

  test("first arg is Contradiction → Contradiction", () => {
    const contra = new Contradiction("test", new Set());
    expect(naryUnpackingDissertation(add)(contra, new Something(2)) instanceof Contradiction).toBe(true);
  });
});
