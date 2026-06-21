import { emitJs } from "../../src/language/index.js";
import { loadProgram } from "../../src/language/runtime/load.js";

// End-to-end codegen-robustness: programs that the grammar ACCEPTS but the emitter used to
// lower to broken JS (SyntaxError at module-eval). Each test compiles to the artifact and LOADS
// it (the in-process equivalent of running it) — so a regression resurfaces as a load/SyntaxError,
// exactly as the original bug did. Covers: #1 string-literal escaping, #2 special-char record
// field names, #3 special-char / reserved-word binders (params, let, match).

const registryOf = (src: string) => loadProgram(emitJs(src)).registry;

describe("codegen robustness — #1 string literals", () => {
  test("a multi-line single-quoted string literal emits valid JS and round-trips", () => {
    const reg = registryOf(`
      defn ml
        signature: from [Number?(n)] to String?;
        expression 'line1
line2';
      end
    `);
    expect(reg.resolve("ml")(0)).toBe("line1\nline2");
  });

  test("tabs and embedded quotes survive", () => {
    const reg = registryOf(`
      defn q
        signature: from [Number?(n)] to String?;
        expression 'a\tb "c"';
      end
    `);
    expect(reg.resolve("q")(0)).toBe('a\tb "c"');
  });
});

describe("codegen robustness — #2 special-char record field names", () => {
  const reg = () =>
    registryOf(`
      defrecord R
        ok?: Boolean?;
        name: String?;
      end
      defn getOk
        signature: from [R?(r)] to Boolean?;
        expression r.ok?;
      end
      defn matchOk
        signature: from [R?(r)] to Boolean?;
        expression match r | R{ok?: flag} -> flag end;
      end
    `);

  test("constructor builds the record with the raw field key (data shape preserved)", () => {
    expect(reg().resolve("R")(true, "x")).toEqual({ __type: "R", "ok?": true, name: "x" });
  });

  test("the field accessor reads the special-char field", () => {
    const r = reg().resolve("R")(true, "x");
    expect(reg().resolve("R.ok?")(r)).toBe(true);
  });

  test("`r.ok?` field access in a defn body works", () => {
    const r = reg().resolve("R")(true, "x");
    expect(reg().resolve("getOk")(r)).toBe(true);
  });

  test("a match record-pattern reads the special-char field", () => {
    const r = reg().resolve("R")(true, "x");
    expect(reg().resolve("matchOk")(r)).toBe(true);
  });
});

describe("codegen robustness — #3 special-char / reserved-word binders", () => {
  test("a defn param with a special char (`ok?`) works", () => {
    const reg = registryOf(`
      defn f
        signature: from [Number?(ok?)] to Number?;
        expression ok?;
      end
    `);
    expect(reg.resolve("f")(5)).toBe(5);
  });

  test("a defn param named after a JS reserved word (`class`) works", () => {
    const reg = registryOf(`
      defn g
        signature: from [Number?(class)] to Number?;
        expression class;
      end
    `);
    expect(reg.resolve("g")(7)).toBe(7);
  });

  test("a `let` binder with a special char works", () => {
    const reg = registryOf(`
      defn h
        signature: from [Number?(n)] to Number?;
        expression let ok? = n; ok?;
      end
    `);
    expect(reg.resolve("h")(9)).toBe(9);
  });

  test("a `let` binder named after a reserved word works", () => {
    const reg = registryOf(`
      defn k
        signature: from [Number?(n)] to Number?;
        expression let class = n; class;
      end
    `);
    expect(reg.resolve("k")(4)).toBe(4);
  });

  test("interpolate resolves a reserved-word param root", () => {
    const reg = registryOf(`
      defn greet
        signature: from [String?(class)] to String?;
        interpolate """Hi {{class}}""";
      end
    `);
    expect(reg.resolve("greet")("Ada")).toBe("Hi Ada");
  });
});
