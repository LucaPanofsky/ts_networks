import { createSandbox } from "../../../src/sandbox/jsgen/runtime.js";
import { parseProgram } from "../../../src/data-network/tree-to-network.js";

const src = `
defrecord Vec2
  x: Number?;
  y: Number?;
end

defn length
  signature: from [Vec2?(v)] to Number?;
  expression v.x * v.x + v.y * v.y;
end

defn abs
  signature: from [Number?(x)] to Number?;
  expression if(x >= 0, x, 0 - x);
end
`;

describe("createSandbox", () => {
  const sandbox = createSandbox(parseProgram(src));

  test("exposes Vec2 constructor", () => {
    expect(typeof sandbox["Vec2"]).toBe("function");
  });

  test("exposes Vec2? predicate", () => {
    expect(typeof sandbox["Vec2?"]).toBe("function");
  });

  test("exposes length fn", () => {
    expect(typeof sandbox["length"]).toBe("function");
  });

  test("exposes abs fn", () => {
    expect(typeof sandbox["abs"]).toBe("function");
  });

  test("Vec2 constructor returns a plain JS object", () => {
    expect(sandbox["Vec2"]!(3, 4)).toEqual({ __type: "Vec2", x: 3, y: 4 });
  });

  test("Vec2? returns true for a value from the constructor", () => {
    const v = sandbox["Vec2"]!(3, 4);
    expect(sandbox["Vec2?"]!(v)).toBe(true);
  });

  test("Vec2? returns true for a plain JS object", () => {
    expect(sandbox["Vec2?"]!({ __type: "Vec2", x: 3, y: 4 })).toBe(true);
  });

  test("Vec2? returns false for a wrong type", () => {
    expect(sandbox["Vec2?"]!({ __type: "Other", x: 3, y: 4 })).toBe(false);
  });

  test("length from constructor value is 25", () => {
    const v = sandbox["Vec2"]!(3, 4);
    expect(sandbox["length"]!(v)).toBe(25);
  });

  test("length from plain JS object is 25", () => {
    expect(sandbox["length"]!({ x: 3, y: 4 })).toBe(25);
  });

  test("abs of negative number", () => {
    expect(sandbox["abs"]!(-5)).toBe(5);
  });

  test("abs of positive number", () => {
    expect(sandbox["abs"]!(3)).toBe(3);
  });

  test("abs of zero", () => {
    expect(sandbox["abs"]!(0)).toBe(0);
  });
});
