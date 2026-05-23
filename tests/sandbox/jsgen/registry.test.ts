import { buildRegistry } from "../../../src/sandbox/jsgen/registry.js";
import type { ProgramAST, RecordAST, FnAST } from "../../../src/data-network/types.js";
import type { Sandbox } from "../../../src/sandbox/jsgen/runtime.js";

const vec2: RecordAST = {
  kind: "record", name: "Vec2",
  fields: [{ name: "x", predicate: "Number?" }, { name: "y", predicate: "Number?" }],
};

const lengthFn: FnAST = {
  kind: "fn", isPredicate: false, name: "length",
  params: [{ predicate: "Vec2?", name: "v" }],
  returnType: "Number?",
  body: { kind: "literal", value: 0 },
};

const mockVec2 = (x: unknown, y: unknown) => ({ __type: "Vec2", x, y });
const mockLength = (v: unknown) => { const r = v as { x: number; y: number }; return r.x * r.x + r.y * r.y; };

const mockSandbox: Sandbox = {
  Vec2: mockVec2,
  "Vec2?": (v: unknown) => (v as { __type: string }).__type === "Vec2",
  length: mockLength,
};

const program: ProgramAST = { records: [vec2], fns: [lengthFn], networks: [], derives: [] };

describe("buildRegistry: fns", () => {
  const registry = buildRegistry(program, mockSandbox);

  test("fn entry exists", () => {
    expect(registry.get("length")).toBeDefined();
  });

  test("fn arity", () => {
    expect(registry.get("length")!.arity).toBe(1);
  });

  test("fn morphism from", () => {
    expect(registry.get("length")!.morphism.from).toEqual(["Vec2?"]);
  });

  test("fn morphism to", () => {
    expect(registry.get("length")!.morphism.to).toBe("Number?");
  });

  test("fn impl is the sandbox fn", () => {
    expect(registry.get("length")!.impl).toBe(mockLength);
  });
});

describe("buildRegistry: record constructor", () => {
  const registry = buildRegistry(program, mockSandbox);

  test("constructor entry exists", () => {
    expect(registry.get("Vec2")).toBeDefined();
  });

  test("constructor arity matches field count", () => {
    expect(registry.get("Vec2")!.arity).toBe(2);
  });

  test("constructor morphism from field predicates", () => {
    expect(registry.get("Vec2")!.morphism.from).toEqual(["Number?", "Number?"]);
  });

  test("constructor morphism to predicate name", () => {
    expect(registry.get("Vec2")!.morphism.to).toBe("Vec2?");
  });

  test("constructor impl is the sandbox fn", () => {
    expect(registry.get("Vec2")!.impl).toBe(mockVec2);
  });
});

describe("buildRegistry: field accessors", () => {
  const registry = buildRegistry(program, mockSandbox);

  test("x accessor exists", () => {
    expect(registry.get("Vec2.x")).toBeDefined();
  });

  test("y accessor exists", () => {
    expect(registry.get("Vec2.y")).toBeDefined();
  });

  test("x accessor arity is 1", () => {
    expect(registry.get("Vec2.x")!.arity).toBe(1);
  });

  test("x accessor morphism from", () => {
    expect(registry.get("Vec2.x")!.morphism.from).toEqual(["Vec2?"]);
  });

  test("x accessor morphism to", () => {
    expect(registry.get("Vec2.x")!.morphism.to).toBe("Number?");
  });

  test("x accessor extracts x from a record", () => {
    const v = { __type: "Vec2", x: 7, y: 2 };
    expect(registry.get("Vec2.x")!.impl(v)).toBe(7);
  });

  test("y accessor extracts y from a record", () => {
    const v = { __type: "Vec2", x: 7, y: 2 };
    expect(registry.get("Vec2.y")!.impl(v)).toBe(2);
  });
});

describe("buildRegistry: entry count", () => {
  test("total entries = 1 builtin + 1 fn + 1 constructor + 2 accessors", () => {
    const registry = buildRegistry(program, mockSandbox);
    expect(registry.entries()).toHaveLength(5);
  });
});
