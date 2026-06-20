// defn slice — eval + assert. Emit the .js, run it against the runtime, call the
// registered impl, and assert it computes. Reuses the same strip-and-eval harness as the
// defrecord test (top-level import/export stripped, `rt` injected).

import { emitJs, parseProgram } from "../../src/language/index.js";
import * as rt from "../../src/language/runtime/index.js";
import type { Registry } from "../../src/language/core/runtime-api.js";

function run(js: string): Registry {
  const body =
    js
      .split("\n")
      .filter((l) => !/^\s*import\s/.test(l) && !/^\s*export\s/.test(l))
      .join("\n") + "\nreturn __reg;";
  return new Function("rt", body)(rt) as Registry;
}

describe("defn slice — source → emitted .js → run", () => {
  test("an arithmetic/field-access body computes", () => {
    const reg = run(
      emitJs(`
defn rectangleArea
  signature: from [Rectangle?(r)] to Number?;
  expression
    r.width * r.height;
end
`),
    );
    expect(reg.resolve("rectangleArea")({ width: 3, height: 4 })).toBe(12);
  });

  test("a let body computes (nested bindings)", () => {
    const reg = run(
      emitJs(`
defn sumTwo
  signature: from [Number?(a), Number?(b)] to Number?;
  expression
    let s = a + b;
    s * s;
end
`),
    );
    expect(reg.resolve("sumTwo")(2, 3)).toBe(25);
  });

  test("a match body over a record defined in the same source", () => {
    const reg = run(
      emitJs(`
defrecord Circle
  radius: Number?;
end

defn classify
  signature: from [Circle?(s)] to String?;
  expression
    match s
      | Circle { radius: r } when r > 10 -> 'big'
      | _ -> 'small'
    end;
end
`),
    );
    const classify = reg.resolve("classify");
    const big = reg.resolve("Circle")(42);
    const small = reg.resolve("Circle")(1);
    expect(classify(big)).toBe("big");
    expect(classify(small)).toBe("small");
  });

  test("an `if` body computes", () => {
    const reg = run(
      emitJs(`
defn sign
  signature: from [Number?(n)] to String?;
  expression
    if(n > 0, 'pos', 'neg');
end
`),
    );
    expect(reg.resolve("sign")(5)).toBe("pos");
    expect(reg.resolve("sign")(-2)).toBe("neg");
  });

  test("a malformed defn body throws at parse", () => {
    expect(() =>
      parseProgram(`
defn bad
  signature: from [Number?(n)] to Number?;
  expression
    n +;
end
`),
    ).toThrow();
  });
});
