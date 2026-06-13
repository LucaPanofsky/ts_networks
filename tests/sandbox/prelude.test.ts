import { compile } from "../../src/sandbox/jsgen/index.js";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { run } from "../../src/operations/run.js";
import { typecheck } from "../../src/operations/typecheck.js";
import { PRELUDE_SOURCE, withPrelude } from "../../src/sandbox/prelude.js";

// The prelude is the standard library: a set of `defn`s (booleans, arithmetic,
// comparisons, math) auto-supplied to every program so a stranger never hits
// "unknown function" for `not`/`add`/`max`. It is written in the language itself
// (`src/prelude.tsn`) and merged into every program at `compile()` time, which makes
// each entry BOTH propagatable (a registry entry) AND usable inside expressions (a
// sandbox const) — the same as a hand-written `defn`. Host-only primitives that the
// language cannot express (`sqrt`, `abs`, `mod`, …) live under a `math/` namespace of
// expression builtins; the prelude wraps the propagatable-useful ones as `defn`s.

describe("prelude: capabilities — usable without being defined", () => {
  test("boolean + comparison prelude fns are callable inside an expression", () => {
    const { sandbox } = compile(`
      defn inRange
        signature: from [Number?(n)] to Boolean?;
        expression and(gt(n, 0), lt(n, 10));
      end
    `);
    expect(sandbox["inRange"]!(5)).toBe(true);
    expect(sandbox["inRange"]!(15)).toBe(false);
    expect(sandbox["inRange"]!(-1)).toBe(false);
  });

  test("arithmetic prelude fns are callable inside an expression", () => {
    const { sandbox } = compile(`
      defn poly
        signature: from [Number?(a), Number?(b)] to Number?;
        expression add(mul(a, a), mul(b, b));
      end
    `);
    expect(sandbox["poly"]!(3, 4)).toBe(25);
  });

  test("not / and / or behave as the boolean operators", () => {
    const { sandbox } = compile(`
      defn n  signature: from [Boolean?(x)] to Boolean?; expression not(x);  end
      defn a2 signature: from [Boolean?(x), Boolean?(y)] to Boolean?; expression and(x, y); end
      defn o2 signature: from [Boolean?(x), Boolean?(y)] to Boolean?; expression or(x, y);  end
    `);
    expect(sandbox["n"]!(true)).toBe(false);
    expect(sandbox["a2"]!(true, false)).toBe(false);
    expect(sandbox["o2"]!(true, false)).toBe(true);
  });
});

describe("prelude: math intrinsics + their propagatable wrappers", () => {
  test("the math/ namespace is available inside expressions", () => {
    const { sandbox } = compile(`
      defn hyp
        signature: from [Number?(a), Number?(b)] to Number?;
        expression math/sqrt(add(mul(a, a), mul(b, b)));
      end
      defn r signature: from [Number?(n)] to Number?; expression math/round(n); end
      defn m signature: from [Number?(a), Number?(b)] to Number?; expression math/mod(a, b); end
    `);
    expect(sandbox["hyp"]!(3, 4)).toBe(5);
    expect(sandbox["r"]!(2.6)).toBe(3);
    expect(sandbox["m"]!(7, 3)).toBe(1);
  });

  test("the math wrappers (sqrt/abs/max/min) ship as propagatable prelude fns", () => {
    const { sandbox, registry } = compile(`
      defn id signature: from [Number?(n)] to Number?; expression n; end
    `);
    expect(sandbox["sqrt"]!(16)).toBe(4);
    expect(sandbox["abs"]!(-3)).toBe(3);
    expect(sandbox["max"]!(2, 9)).toBe(9);
    expect(sandbox["min"]!(2, 9)).toBe(2);
    // propagatable: present in the registry with a morphism
    expect(registry.get("sqrt")?.morphism).toEqual({ from: ["Number?"], to: "Number?" });
  });
});

describe("prelude: propagatable end-to-end (the search.tsn failure mode)", () => {
  test("`propagate not` resolves without a user-defined `not`", async () => {
    const out = await run.handle({
      source: `
        defnetwork flip
          signature: from [x] to y;
          propagate not from [x] to y;
        end
      `,
      network: "flip",
      cells: { x: "true" },
    });
    expect(out).toEqual({ ok: true, network: "flip", cells: { x: true, y: false } });
  });

  test("`propagate add` resolves and computes", async () => {
    const out = await run.handle({
      source: `
        defnetwork plus
          signature: from [a, b] to c;
          propagate add from [a, b] to c;
        end
      `,
      network: "plus",
      cells: { a: "2", b: "3" },
    });
    expect(out).toMatchObject({ ok: true, cells: { c: 5 } });
  });
});

describe("prelude: invariants", () => {
  test("a user definition of the same name SHADOWS the prelude (no double-const crash)", () => {
    // `add` collides with a prelude fn. The merge must DROP the prelude's `add` so the
    // sandbox emits one `const`, not two — and the user's impl must win.
    const { sandbox } = compile(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression sub(a, b);
      end
    `);
    expect(sandbox["add"]!(10, 3)).toBe(7); // user's (subtraction), not prelude's (10+3)
  });

  test("withPrelude drops every prelude fn the user redefines", () => {
    const user = parseProgram(`
      defn not signature: from [Boolean?(x)] to Boolean?; expression x; end
    `);
    const merged = withPrelude(user);
    const notDefs = merged.fns.filter(f => f.name === "not");
    expect(notDefs).toHaveLength(1);
    // the surviving `not` is the user's identity body, not the prelude's negation
    const userNot = merged.fns.find(f => f.name === "not")!;
    expect(userNot).toBe(user.fns.find(f => f.name === "not"));
  });

  test("the prelude is environment, not source: it does not leak into a parsed AST", () => {
    // `parse` reports exactly what the user wrote — the prelude is supplied at compile
    // time (like the BUILTIN_DEFS), so it must be invisible to parseProgram's output.
    const ast = parseProgram(`
      defn only signature: from [Number?(n)] to Number?; expression n; end
    `);
    expect(ast.fns.map(f => f.name)).toEqual(["only"]);
  });
});

describe("prelude: the artifact itself is valid", () => {
  test("the prelude source parses", () => {
    expect(() => parseProgram(PRELUDE_SOURCE)).not.toThrow();
  });

  test("the prelude source type-checks clean", () => {
    expect(typecheck.handle({ source: PRELUDE_SOURCE })).toMatchObject({ ok: true });
  });
});
