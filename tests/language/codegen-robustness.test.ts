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
