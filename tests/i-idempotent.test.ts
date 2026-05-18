import { I, Nothing, Something, Contradiction } from "../src/info-structure.js";

describe("I: idempotent", () => {
  test("I(Something) returns the same Something", () => {
    const s = new Something(42);
    expect(I(s)).toBe(s);
  });

  test("I(Nothing) returns Nothing", () => {
    expect(I(Nothing)).toBe(Nothing);
  });

  test("I(Contradiction) returns the same Contradiction", () => {
    const c = new Contradiction("test", new Set());
    expect(I(c)).toBe(c);
  });
});
