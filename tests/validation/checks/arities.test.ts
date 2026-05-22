import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { checkArities } from "../../../src/validation/checks/arities.js";

function parse(dsl: string) {
  return parseProgram(dsl);
}

// ── happy paths ───────────────────────────────────────────────────────────────

describe("checkArities: no errors", () => {
  test("propagate arity matches defn param count", () => {
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end

      defnetwork sum
        signature: from [x, y] to z;
        propagate add from [x, y] to z;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });

  test("propagate arity matches record constructor field count", () => {
    const prog = parse(`
      defrecord Point
        x: Number?;
        y: Number?;
      end

      defnetwork make-point
        signature: from [x, y] to p;
        propagate Point from [x, y] to p;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });

  test("propagate arity 1 matches field accessor", () => {
    const prog = parse(`
      defrecord Point
        x: Number?;
        y: Number?;
      end

      defnetwork get-x
        signature: from [p] to x;
        propagate Point.x from [p] to x;
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

  test("non-propagate terms are not checked", () => {
    const prog = parse(`
      defnetwork seeded
        signature: from [a] to b;
        cell b = 0;
        switch from [a] to b;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });

  test("unknown function reference is not double-reported", () => {
    const prog = parse(`
      defnetwork broken
        signature: from [x] to y;
        propagate ghost from [x] to y;
      end
    `);
    expect(checkArities(prog)).toEqual([]);
  });
});

// ── error cases ───────────────────────────────────────────────────────────────

describe("checkArities: errors", () => {
  test("too few inputs for a defn", () => {
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end

      defnetwork broken
        signature: from [x] to z;
        propagate add from [x] to z;
      end
    `);
    const errors = checkArities(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: "error",
      check:    "arities",
      network:  "broken",
      message:  '"add" expects 2 input(s) but is called with 1',
    });
  });

  test("too many inputs for a defn", () => {
    const prog = parse(`
      defn negate
        signature: from [Number?(x)] to Number?;
        expression x * -1;
      end

      defnetwork broken
        signature: from [a, b] to z;
        propagate negate from [a, b] to z;
      end
    `);
    const errors = checkArities(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: "error",
      check:    "arities",
      network:  "broken",
      message:  '"negate" expects 1 input(s) but is called with 2',
    });
  });

  test("wrong arity for a record constructor", () => {
    const prog = parse(`
      defrecord Point
        x: Number?;
        y: Number?;
      end

      defnetwork broken
        signature: from [x] to p;
        propagate Point from [x] to p;
      end
    `);
    const errors = checkArities(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('"Point" expects 2 input(s) but is called with 1');
  });

  test("field accessor called with more than 1 input", () => {
    const prog = parse(`
      defrecord Point
        x: Number?;
      end

      defnetwork broken
        signature: from [p, q] to x;
        propagate Point.x from [p, q] to x;
      end
    `);
    const errors = checkArities(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('"Point.x" expects 1 input(s) but is called with 2');
  });

  test("arity exceeds cap of 5", () => {
    const prog = parse(`
      defn huge
        signature: from [Number?(a), Number?(b), Number?(c), Number?(d), Number?(e)] to Number?;
        expression a;
      end

      defnetwork broken
        signature: from [a, b, c, d, e, f] to z;
        propagate huge from [a, b, c, d, e, f] to z;
      end
    `);
    const errors = checkArities(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: "error",
      check:    "arities",
      network:  "broken",
      message:  '"huge" is called with 6 inputs but the maximum supported arity is 5',
    });
  });

  test("over-cap error suppresses the declared-arity check for the same term", () => {
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
