import { createSandbox } from "../../../src/sandbox/scittle/runtime.js";
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
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeAll(async () => {
    sandbox = await createSandbox(parseProgram(src));
  }, 30000);

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

  test("Vec2 constructor produces a value", () => {
    const v = sandbox["Vec2"]!(3, 4);
    expect(v).toBeTruthy();
  });

  test("Vec2? returns true for a Vec2", () => {
    const v = sandbox["Vec2"]!(3, 4);
    expect(sandbox["Vec2?"]!(v)).toBe(true);
  });

  test("length of 3,4 is 25", () => {
    const v = sandbox["Vec2"]!(3, 4);
    expect(sandbox["length"]!(v)).toBe(25);
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
