// Arbiter test for GavaLang slice 1: a defrecord program → emitted .js → run it.
//
// "Eval + assert behavior": we emit the JS module, evaluate it against the runtime
// (the new pipeline's @tsn/runtime, backed by the existing registry), and assert the
// constructor / predicate / accessor leaves actually work when called through the
// registry. The emitted module uses top-level `import`/`export` (illegal in
// `new Function`), so we strip those and inject `rt`, mirroring how `createSandbox`
// evaluates emitted source elsewhere in the repo.

import { emitJs, parseProgram } from "../../src/language/index.js";
import { ConstructConflict } from "../../src/language/pipeline/combine.js";
import * as rt from "../../src/language/runtime/index.js";
import type { Registry } from "../../src/language/core/runtime-api.js";

// Strip the module's top-level import/export lines and run the body with `rt` injected,
// returning the assembled registry.
function run(js: string): Registry {
  const body =
    js
      .split("\n")
      .filter((l) => !/^\s*import\s/.test(l) && !/^\s*export\s/.test(l))
      .join("\n") + "\nreturn __reg;";
  return new Function("rt", body)(rt) as Registry;
}

describe("defrecord slice — source → emitted .js → run", () => {
  const source = `
defrecord Point
  x: Number?;
  y: Number?;
end

defrecord Polyline
  name: String?;
  points: [Point?];
end
`;

  test("the constructor leaf builds the tagged record", () => {
    const reg = run(emitJs(source));
    expect(reg.resolve("Point")(3, 4)).toEqual({ __type: "Point", x: 3, y: 4 });
  });

  test("the predicate leaf recognizes its own records and rejects others", () => {
    const reg = run(emitJs(source));
    const p = reg.resolve("Point")(1, 2);
    expect(reg.resolve("Point?")(p)).toBe(true);
    expect(reg.resolve("Point?")({ __type: "Polyline" })).toBe(false);
    expect(reg.resolve("Point?")(null)).toBe(false);
  });

  test("the accessor leaf reads a field", () => {
    const reg = run(emitJs(source));
    expect(reg.resolve("Point.x")({ __type: "Point", x: 3, y: 4 })).toBe(3);
  });

  test("a vector field is parsed and emitted (second record present)", () => {
    const reg = run(emitJs(source));
    const line = reg.resolve("Polyline")("edge", []);
    expect(line).toEqual({ __type: "Polyline", name: "edge", points: [] });
  });
});

describe("defrecord slice — failure modes", () => {
  test("a malformed defrecord makes parsing throw", () => {
    const bad = `
defrecord Bad
  x Number
end
`;
    expect(() => parseProgram(bad)).toThrow();
  });

  test("two incompatible declarations of one name are a merge conflict", () => {
    const clash = `
defrecord Point
  x: Number?;
end

defrecord Point
  x: Number?;
  y: Number?;
end
`;
    expect(() => emitJs(clash)).toThrow(ConstructConflict);
  });
});
