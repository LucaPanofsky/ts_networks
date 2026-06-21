import { combine, registryKey, ConstructConflict } from "../../src/language/pipeline/combine.js";
import { ConstructKind } from "../../src/language/core/enums.js";
import type { AstNode } from "../../src/language/pipeline/program.js";

// combine — the conflict gate: fold parsed nodes into a registry under merge semantics
// (order-independent; same-key incompatible declarations are a Contradiction, identical
// re-declaration is an idempotent no-op). Keyed by `registryKey` (heavy constructs namespaced).

const field = (name: string, predicate = "Number?") =>
  ({ name, type: { kind: "scalar" as const, predicate } });

const record = (name: string, fields: ReturnType<typeof field>[] = []): AstNode =>
  ({ kind: ConstructKind.Record, name, fields }) as unknown as AstNode;

const grammar = (name: string): AstNode =>
  ({ kind: ConstructKind.Grammar, name, source: `${name} {}` }) as unknown as AstNode;

describe("combine — capabilities", () => {
  test("distinct nodes register under their registryKey", () => {
    const reg = combine([record("A"), record("B")]);
    expect([...reg.keys()].sort()).toEqual(["A", "B"]);
  });

  test("identical re-declaration is an idempotent no-op (one entry, no throw)", () => {
    const reg = combine([record("R", [field("x")]), record("R", [field("x")])]);
    expect(reg.size).toBe(1);
  });
});

describe("combine — invariants", () => {
  test("equality is ORDER-INDEPENDENT (key order doesn't fabricate a conflict)", () => {
    // Same record, every object's keys inserted in a DIFFERENT order. JSON.stringify would
    // have flagged these as conflicting; valueEquals (key-set + field-wise) sees them equal.
    const a = { kind: ConstructKind.Record, name: "R", fields: [{ name: "x", type: { kind: "scalar", predicate: "Number?" } }] } as unknown as AstNode;
    const b = { fields: [{ type: { predicate: "Number?", kind: "scalar" }, name: "x" }], name: "R", kind: ConstructKind.Record } as unknown as AstNode;
    expect(() => combine([a, b])).not.toThrow();
    expect(combine([a, b]).size).toBe(1);
  });

  test("registryKey namespaces heavy constructs so a defrecord/defgrammar of the same name don't collide", () => {
    expect(registryKey(record("Foo"))).toBe("Foo");
    expect(registryKey(grammar("Foo"))).toBe("grammar/Foo");
    const reg = combine([record("Foo"), grammar("Foo")]);
    expect([...reg.keys()].sort()).toEqual(["Foo", "grammar/Foo"]);
  });
});

describe("combine — negative", () => {
  test("two same-key declarations carrying DIFFERENT info are a ConstructConflict", () => {
    expect(() => combine([record("R", [field("x")]), record("R", [field("y")])])).toThrow(ConstructConflict);
  });

  test("two same-name same-kind heavy constructs still conflict (namespacing doesn't hide it)", () => {
    const g1 = { kind: ConstructKind.Grammar, name: "G", source: "G { a = \"x\" }" } as unknown as AstNode;
    const g2 = { kind: ConstructKind.Grammar, name: "G", source: "G { a = \"y\" }" } as unknown as AstNode;
    expect(() => combine([g1, g2])).toThrow(ConstructConflict);
  });
});
