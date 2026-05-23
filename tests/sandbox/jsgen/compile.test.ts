import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Something } from "../../../src/info-structure.js";

const dsl = `
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

defnetwork normalize
  signature: from [raw] to result;
  propagate length from [raw] to result;
end
`;

describe("compile: end-to-end", () => {
  const result = compile(dsl);

  test("sandbox exposes Vec2 constructor", () => {
    expect(typeof result.sandbox["Vec2"]).toBe("function");
  });

  test("sandbox functions work", () => {
    expect(result.sandbox["abs"]!(-3)).toBe(3);
  });

  test("registry has length fn", () => {
    expect(result.registry.get("length")).toBeDefined();
  });

  test("registry has Vec2 constructor", () => {
    expect(result.registry.get("Vec2")).toBeDefined();
  });

  test("registry has Vec2.x accessor", () => {
    expect(result.registry.get("Vec2.x")).toBeDefined();
  });

  test("networks map contains normalize", () => {
    expect(result.networks.has("normalize")).toBe(true);
  });

  test("normalize network derives length from a Vec2", () => {
    const v = result.sandbox["Vec2"]!(3, 4);
    const run = result.networks.get("normalize")!.invoke({ raw: v });
    expect(run.type).toBe("done");
    expect(run.cells.get("result")!.knows()).toEqual(new Something(25));
  });
});
