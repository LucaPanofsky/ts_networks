import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { checkTopology } from "../../../src/validation/checks/topology.js";

function parse(dsl: string) {
  return parseProgram(dsl);
}

// ── happy paths ───────────────────────────────────────────────────────────────

describe("checkTopology: no errors", () => {
  test("simple directed network — inputs are heads, output is a tail", () => {
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
    expect(checkTopology(prog)).toEqual([]);
  });

  test("network with intermediate cells — only signature cells are checked", () => {
    const prog = parse(`
      defn square
        signature: from [Number?(x)] to Number?;
        expression x * x;
      end

      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end

      defnetwork sum-of-squares
        signature: from [a, b] to result;
        propagate square from [a] to a2;
        propagate square from [b] to b2;
        propagate add from [a2, b2] to result;
      end
    `);
    expect(checkTopology(prog)).toEqual([]);
  });

  test("network with no propagate terms", () => {
    const prog = parse(`
      defnetwork trivial
        signature: from [a] to b;
        cell b = 0;
      end
    `);
    expect(checkTopology(prog)).toEqual([]);
  });

  test("switch term: output cell not used as input", () => {
    const prog = parse(`
      defnetwork routing
        signature: from [a, b] to c;
        switch from [a, b] to c;
      end
    `);
    expect(checkTopology(prog)).toEqual([]);
  });
});

// ── error cases ───────────────────────────────────────────────────────────────

describe("checkTopology: errors", () => {
  test("signature output is used as input by a propagator", () => {
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end

      defn negate
        signature: from [Number?(x)] to Number?;
        expression x * -1;
      end

      defnetwork broken
        signature: from [x, y] to z;
        propagate add from [x, y] to z;
        propagate negate from [z] to w;
      end
    `);
    const errors = checkTopology(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: "warning",
      check:    "topology",
      network:  "broken",
      message:  'signature output "z" is used as input by a propagator — it is not a terminal',
    });
  });

  test("signature input is written to by a propagator", () => {
    const prog = parse(`
      defn double
        signature: from [Number?(x)] to Number?;
        expression x * 2;
      end

      defnetwork broken
        signature: from [x] to y;
        propagate double from [x] to x;
      end
    `);
    const errors = checkTopology(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      severity: "warning",
      check:    "topology",
      network:  "broken",
      message:  'signature input "x" is written to by a propagator — it is not a source',
    });
  });

  test("multiple signature inputs written to produce multiple errors", () => {
    const prog = parse(`
      defn f
        signature: from [Number?(x)] to Number?;
        expression x;
      end

      defnetwork broken
        signature: from [a, b] to c;
        propagate f from [c] to a;
        propagate f from [c] to b;
        propagate f from [a] to c;
      end
    `);
    const errors = checkTopology(prog);
    expect(errors.filter(e => e.message.startsWith('signature input'))).toHaveLength(2);
  });

  test("errors are attributed to the correct network", () => {
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end

      defn negate
        signature: from [Number?(x)] to Number?;
        expression x * -1;
      end

      defnetwork ok
        signature: from [x, y] to z;
        propagate add from [x, y] to z;
      end

      defnetwork broken
        signature: from [x, y] to z;
        propagate add from [x, y] to z;
        propagate negate from [z] to w;
      end
    `);
    const errors = checkTopology(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.network).toBe("broken");
  });

  test("bidirectional equation network fails — every cell is both written to and read from", () => {
    // This is a known limitation: the topology check is strict about the declared
    // signature direction. Bidirectional networks violate it by design.
    const prog = parse(`
      defn add
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a + b;
      end

      defn sub
        signature: from [Number?(a), Number?(b)] to Number?;
        expression a - b;
      end

      defnetwork equation
        signature: from [a, b] to c;
        propagate add from [a, b] to c;
        propagate sub from [c, a] to b;
        propagate sub from [c, b] to a;
      end
    `);
    const errors = checkTopology(prog);
    expect(errors.length).toBeGreaterThan(0);
  });
});
