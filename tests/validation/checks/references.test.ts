import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { checkReferences } from "../../../src/validation/checks/references.js";

function parse(dsl: string) {
  return parseProgram(dsl);
}

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("checkReferences: no errors", () => {
  test("all three callable kinds — defn, record constructor, field accessor — are recognized as valid", () => {
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
    expect(checkReferences(prog)).toEqual([]);
  });

  // ── Invariants ──────────────────────────────────────────────────────────────
  test("non-propagate terms (cell) are not subject to the references check", () => {
    const prog = parse(`
      defnetwork empty
        signature: from [a] to b;
        cell b = 0;
      end
    `);
    expect(checkReferences(prog)).toEqual([]);
  });

  test("switch term is not subject to the references check", () => {
    const prog = parse(`
      defnetwork routing
        signature: from [a, b] to c;
        switch from [a, b] to c;
      end
    `);
    expect(checkReferences(prog)).toEqual([]);
  });
});

// ── Negative tests ────────────────────────────────────────────────────────────

describe("checkReferences: errors", () => {
  test("propagate referencing an undefined function produces a descriptive error", () => {
    const prog = parse(`
      defnetwork broken
        signature: from [x, y] to z;
        propagate ghost from [x, y] to z;
      end
    `);
    expect(checkReferences(prog)[0]).toMatchObject({
      severity: "error",
      check:    "references",
      network:  "broken",
      message:  'unknown function "ghost"',
    });
  });

  test("two undefined functions in the same network produce two errors", () => {
    const prog = parse(`
      defnetwork broken
        signature: from [a, b] to c;
        propagate foo from [a] to b;
        propagate bar from [b] to c;
      end
    `);
    expect(checkReferences(prog)).toHaveLength(2);
  });

  test("record field accessor from a non-existent field is flagged", () => {
    const prog = parse(`
      defrecord Point
        x: Number?;
        y: Number?;
      end
      defnetwork get-z
        signature: from [p] to z;
        propagate Point.z from [p] to z;
      end
    `);
    expect(checkReferences(prog)[0]!.message).toBe('unknown function "Point.z"');
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
        signature: from [x] to y;
        propagate missing from [x] to y;
      end
    `);
    const errors = checkReferences(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.network).toBe("broken");
  });
});
