import { makeDefaultHandler } from "../../src/network-impl/make-default-handler.js";
import { Nothing, Something, Contradiction } from "../../src/info-structure.js";

const add = (a: unknown, b: unknown) => (a as number) + (b as number);
const triple = (a: unknown, b: unknown, c: unknown) => (a as number) + (b as number) + (c as number);
const identity = (a: unknown) => a;

describe("makeDefaultHandler: arity 1", () => {
  test("applies fn to Something", () => {
    const h = makeDefaultHandler(identity, 1);
    expect(h(new Something(42)).equals(new Something(42))).toBe(true);
  });

  test("short-circuits on Nothing", () => {
    const h = makeDefaultHandler(identity, 1);
    expect(h(Nothing)).toBe(Nothing);
  });

  test("short-circuits on Contradiction", () => {
    const h = makeDefaultHandler(identity, 1);
    const c = new Contradiction("test", new Set());
    expect(h(c) instanceof Contradiction).toBe(true);
  });
});

describe("makeDefaultHandler: arity 2", () => {
  test("applies fn to two Somethings", () => {
    const h = makeDefaultHandler(add, 2);
    expect(h(new Something(3), new Something(4)).equals(new Something(7))).toBe(true);
  });

  test("short-circuits on first Nothing", () => {
    const h = makeDefaultHandler(add, 2);
    expect(h(Nothing, new Something(4))).toBe(Nothing);
  });

  test("short-circuits on second Nothing", () => {
    const h = makeDefaultHandler(add, 2);
    expect(h(new Something(3), Nothing)).toBe(Nothing);
  });

  test("short-circuits on Contradiction", () => {
    const h = makeDefaultHandler(add, 2);
    const c = new Contradiction("test", new Set());
    expect(h(c, new Something(4)) instanceof Contradiction).toBe(true);
  });
});

describe("makeDefaultHandler: arity 3", () => {
  test("applies fn to three Somethings", () => {
    const h = makeDefaultHandler(triple, 3);
    expect(h(new Something(1), new Something(2), new Something(3)).equals(new Something(6))).toBe(true);
  });

  test("short-circuits on any Nothing", () => {
    const h = makeDefaultHandler(triple, 3);
    expect(h(new Something(1), Nothing, new Something(3))).toBe(Nothing);
  });
});

describe("makeDefaultHandler: arity > 5", () => {
  test("throws for arity 6", () => {
    expect(() => makeDefaultHandler(identity, 6)).toThrow();
  });
});
