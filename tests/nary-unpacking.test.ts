import { Nothing, Something, Contradiction } from "../src/info-structure.js";
import { naryUnpacking } from "../src/nary-unpacking.js";

const add = (a: unknown, b: unknown) => (a as number) + (b as number);
const concat = (a: unknown, b: unknown, c: unknown) => `${a}${b}${c}`;

describe("naryUnpacking: binary function", () => {
  test("two Somethings → Something with result", () => {
    const unpackedAdd = naryUnpacking(add);
    const result = unpackedAdd(new Something(1), new Something(2));
    expect(result.equals(new Something(3))).toBe(true);
  });

  test("first arg is Nothing → Nothing", () => {
    const unpackedAdd = naryUnpacking(add);
    const result = unpackedAdd(Nothing, new Something(2));
    expect(result).toBe(Nothing);
  });

  test("second arg is Nothing → Nothing", () => {
    const unpackedAdd = naryUnpacking(add);
    const result = unpackedAdd(new Something(1), Nothing);
    expect(result).toBe(Nothing);
  });

  test("first arg is Contradiction → Contradiction", () => {
    const contra = new Contradiction("test", new Set());
    const unpackedAdd = naryUnpacking(add);
    const result = unpackedAdd(contra, new Something(2));
    expect(result instanceof Contradiction).toBe(true);
  });
});

describe("naryUnpacking: ternary function", () => {
  test("three Somethings → Something with result", () => {
    const unpackedConcat = naryUnpacking(concat);
    const result = unpackedConcat(new Something("a"), new Something("b"), new Something("c"));
    expect(result.equals(new Something("abc"))).toBe(true);
  });

  test("any arg is Nothing → Nothing", () => {
    const unpackedConcat = naryUnpacking(concat);
    const result = unpackedConcat(new Something("a"), Nothing, new Something("c"));
    expect(result).toBe(Nothing);
  });
});

describe("naryUnpacking: nullary function", () => {
  test("no args → Something with result", () => {
    const unpackedConst = naryUnpacking(() => 42);
    const result = unpackedConst();
    expect(result.equals(new Something(42))).toBe(true);
  });
});
