// defn slice — eval + assert. Emit the .js, run it against the runtime, call the
// registered impl, and assert it computes. Reuses the same strip-and-eval harness as the
// defrecord test (top-level import/export stripped, `rt` injected).

import { emitJs, parseProgram } from "../../src/language/index.js";
import * as rt from "../../src/language/runtime/index.js";
import type { Registry } from "../../src/language/core/runtime-api.js";
import type { FnNode } from "../../src/language/constructs/defn/ast.js";

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

describe("defn slice — interpolate body", () => {
  const interpSrc = `
defn greet
  signature: from [String?(who)] to String?;
  interpolate """Hi {{who}}, welcome!""";
end
`;

  test("parses to an interpolate Expr (golden snapshot)", () => {
    const node = parseProgram(interpSrc).nodes[0] as FnNode;
    expect(node.body).toEqual({ kind: "interpolate", template: "Hi {{who}}, welcome!" });
    // ...and exactly what the existing (Lezer) parser produces for the same body.
    expect(node.body).toMatchSnapshot();
  });

  test("the body renders against its argument at run time (__interp wired)", () => {
    const reg = run(emitJs(interpSrc));
    expect(reg.resolve("greet")("Ada")).toBe("Hi Ada, welcome!");
  });
});

describe("defn slice — builtins", () => {
  test("a native str/* intrinsic is in scope", () => {
    const reg = run(
      emitJs(`
defn shout
  signature: from [String?(s)] to String?;
  expression str/upper(s);
end
`),
    );
    expect(reg.resolve("shout")("hi")).toBe("HI");
  });

  test("a native math/* intrinsic is in scope", () => {
    const reg = run(
      emitJs(`
defn root
  signature: from [Number?(n)] to Number?;
  expression math/sqrt(n);
end
`),
    );
    expect(reg.resolve("root")(9)).toBe(3);
  });

  test("a prelude function is auto-supplied (callable without defining it)", () => {
    const reg = run(
      emitJs(`
defn plus3
  signature: from [Number?(n)] to Number?;
  expression add(n, 3);
end
`),
    );
    expect(reg.resolve("plus3")(4)).toBe(7);
    // the prelude entry is itself registered/propagatable
    expect(reg.resolve("add")(2, 5)).toBe(7);
  });

  test("a user definition SHADOWS the prelude (user wins)", () => {
    const reg = run(
      emitJs(`
defn add
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a * b;
end
`),
    );
    expect(reg.resolve("add")(2, 3)).toBe(6); // multiply, not the prelude's add
  });
});

describe("defpredicate slice — folded into the Fn module", () => {
  const src = `
defpredicate positive?
  signature: from [Number?(n)] to Boolean?;
  expression n > 0;
end
`;

  test("parses as a fn with isPredicate set", () => {
    const node = parseProgram(src).nodes[0] as FnNode;
    expect(node.kind).toBe("fn");
    expect(node.isPredicate).toBe(true);
    expect(node.name).toBe("positive?");
  });

  test("registers under its ?-name and computes a Boolean", () => {
    const reg = run(emitJs(src));
    expect(reg.resolve("positive?")(5)).toBe(true);
    expect(reg.resolve("positive?")(-2)).toBe(false);
  });
});
