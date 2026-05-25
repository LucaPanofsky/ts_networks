import { parseProgram } from "../../../src/data-network/tree-to-network.js";
import { checkReferences } from "../../../src/validation/checks/references.js";

function parse(dsl: string) {
  return parseProgram(dsl);
}

// ── happy paths ───────────────────────────────────────────────────────────────

describe("checkReferences: no errors", () => {
  test("propagate referencing a defn in the same program", () => {
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
    expect(checkReferences(prog)).toEqual([]);
  });

  test("propagate referencing a record constructor", () => {
    const prog = parse(`
      defrecord Point
        x: Number?;
        y: Number?;
      end

      defnetwork make_point
        signature: from [x, y] to p;
        propagate Point from [x, y] to p;
      end
    `);
    expect(checkReferences(prog)).toEqual([]);
  });

  test("propagate referencing a record field accessor", () => {
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
    expect(checkReferences(prog)).toEqual([]);
  });

  test("network with no propagate terms produces no errors", () => {
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

// ── error cases ───────────────────────────────────────────────────────────────

describe("checkReferences: errors", () => {
  test("propagate referencing an undefined function", () => {
    const prog = parse(`
      defnetwork broken
        signature: from [x, y] to z;
        propagate ghost from [x, y] to z;
      end
    `);
    const errors = checkReferences(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
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
    const errors = checkReferences(prog);
    expect(errors).toHaveLength(2);
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

  test("record field accessor from a different record is flagged", () => {
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
    const errors = checkReferences(prog);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('unknown function "Point.z"');
  });
});
