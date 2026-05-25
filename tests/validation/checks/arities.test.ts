import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { checkArities } from "../../../src/validation/checks/arities.js";

function parse(dsl: string) {
  return parseProgram(dsl);
}

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("checkArities: no errors", () => {
  test("all three callable kinds — defn, record constructor, field accessor — pass when arity is correct", () => {
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end

      defrecord Point
        x: Number?;
        y: Number?;
      end

      defnetwork demo
        signature: from [a, b, p] to z;
        propagate add from [a, b] to z;
        propagate Point from [a, b] to p;
        propagate Point.x from [p] to z;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });

  test("arity exactly at the cap of 5 is accepted", () => {
    const prog = parse(`
      defn five
        signature: from [Number?(a), Number?(b), Number?(c), Number?(d), Number?(e)] to Number?;
        expression a + b + c + d + e;
      end

      defnetwork big
        signature: from [a, b, c, d, e] to z;
        propagate five from [a, b, c, d, e] to z;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });

  // ── Invariants ──────────────────────────────────────────────────────────────
  test("non-propagate terms (cell, switch) are not checked", () => {
    const prog = parse(`
      defnetwork seeded
        signature: from [a] to b;
        cell b = 0;
        switch from [a] to b;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });

  test("unknown function reference is not double-reported by arities check", () => {
    const prog = parse(`
      defnetwork broken
        signature: from [x] to y;
        propagate ghost from [x] to y;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });
});

// ── Negative tests ────────────────────────────────────────────────────────────

describe("checkArities: errors", () => {
  test("wrong arity for a defn: error message names expected and actual count", () => {
    const tooFew = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end
      defnetwork broken
        signature: from [x] to z;
        propagate add from [x] to z;
      end
    `);
    expect(checkArities(tooFew)[0]).toMatchObject({
      severity: "error", check: "arities", network: "broken",
      message: '"add" expects 2 input(s) but is called with 1',
    });

    const tooMany = parse(`
      defn negate
        signature: from [Number?(x)] to Number?;
        expression x * -1;
      end
      defnetwork broken
        signature: from [a, b] to z;
        propagate negate from [a, b] to z;
      end
    `);
    expect(checkArities(tooMany)[0]!.message).toBe('"negate" expects 1 input(s) but is called with 2');
  });

  test("wrong arity for record callables (constructor and field accessor)", () => {
    const badCtor = parse(`
      defrecord Point
        x: Number?;
        y: Number?;
      end
      defnetwork broken
        signature: from [x] to p;
        propagate Point from [x] to p;
      end
    `);
    expect(checkArities(badCtor)[0]!.message).toBe('"Point" expects 2 input(s) but is called with 1');

    const badAccessor = parse(`
      defrecord Point
        x: Number?;
      end
      defnetwork broken
        signature: from [p, q] to x;
        propagate Point.x from [p, q] to x;
      end
    `);
    expect(checkArities(badAccessor)[0]!.message).toBe('"Point.x" expects 1 input(s) but is called with 2');
  });

  test("arity exceeding cap produces cap error and suppresses the declared-arity check", () => {
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end
      defnetwork broken
        signature: from [a, b, c, d, e, f] to z;
        propagate add from [a, b, c, d, e, f] to z;
      end
    `);
    const errors = checkArities(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("maximum supported arity");
  });

  test("errors are attributed to the correct network", () => {
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end
      defnetwork ok
        signature: from [x, y] to z;
        propagate add from [x, y] to z;
      end
      defnetwork broken
        signature: from [x] to z;
        propagate add from [x] to z;
      end
    `);
    const errors = checkArities(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.network).toBe("broken");
  });
});
