import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { buildSchemas, deriveProtocol } from "../../src/data-network/schema.js";

const src = `
defpredicate PositiveNumber?
  signature: from [Number?(n)] to Boolean?;
  expression
    n > 0;
end

defrecord Measurement
  value: PositiveNumber?;
  label: String?;
end
`;

describe("buildSchemas: primitive field", () => {
  const schemas = buildSchemas(parseProgram(src));
  const schema = schemas["Measurement"]!;

  test("schema exists for Measurement", () => {
    expect(schema).toBeDefined();
  });

  test("type is object", () => {
    expect(schema.type).toBe("object");
  });

  test("required lists all fields", () => {
    expect(schema.required).toEqual(["value", "label"]);
  });

  test("label maps to string", () => {
    expect(schema.properties["label"]!.type).toBe("string");
  });

  test("label has no description", () => {
    expect(schema.properties["label"]!.description).toBeUndefined();
  });
});

describe("buildSchemas: user-defined predicate field", () => {
  const schemas = buildSchemas(parseProgram(src));
  const prop = schemas["Measurement"]!.properties["value"]!;

  test("value resolves to base type number", () => {
    expect(prop.type).toBe("number");
  });

  test("value description contains predicate name", () => {
    expect(prop.description).toContain("PositiveNumber?");
  });

  test("value description contains body expression", () => {
    expect(prop.description).toContain("n > 0");
  });
});

describe("buildSchemas: nested record field", () => {
  const src2 = `
defrecord Inner
  x: Number?;
  label: String?;
end

defrecord Outer
  inner: Inner?;
  name: String?;
end
`;
  const schemas = buildSchemas(parseProgram(src2));
  const outerSchema = schemas["Outer"]!;
  const innerProp = outerSchema.properties["inner"]!;

  test("nested record field maps to object type", () => {
    expect(innerProp.type).toBe("object");
  });

  test("nested record has no description", () => {
    expect(innerProp.description).toBeUndefined();
  });

  test("nested record inlines inner properties", () => {
    expect(innerProp.properties).toBeDefined();
    expect(innerProp.properties!["x"]!.type).toBe("number");
    expect(innerProp.properties!["label"]!.type).toBe("string");
  });

  test("nested record inlines required", () => {
    expect(innerProp.required).toEqual(["x", "label"]);
  });

  test("outer schema still has its own required", () => {
    expect(outerSchema.required).toEqual(["inner", "name"]);
  });
});

describe("buildSchemas: vector field", () => {
  const src3 = `
defrecord Tag
  label: String?;
end

defrecord Article
  title: String?;
  tags: [Tag?];
  scores: [Number?];
end
`;
  const schemas = buildSchemas(parseProgram(src3));
  const schema = schemas["Article"]!;

  test("vector of records maps to array type", () => {
    expect(schema.properties["tags"]!.type).toBe("array");
  });

  test("vector of records has inlined items schema", () => {
    const items = schema.properties["tags"]!.items!;
    expect(items.type).toBe("object");
    expect(items.properties!["label"]!.type).toBe("string");
  });

  test("vector of primitives maps to array type", () => {
    expect(schema.properties["scores"]!.type).toBe("array");
  });

  test("vector of primitives has correct items type", () => {
    expect(schema.properties["scores"]!.items!.type).toBe("number");
  });

  test("vector fields appear in required", () => {
    expect(schema.required).toContain("tags");
    expect(schema.required).toContain("scores");
  });
});

// ── deriveProtocol ────────────────────────────────────────────────────────────

const protocolSrc = `
defrecord DocumentAnalysis
  type: String?;
  sentiment: String?;
  confidence: Number?;
end
`;

describe("deriveProtocol: record return type", () => {
  const program = parseProgram(protocolSrc);
  const protocol = deriveProtocol("DocumentAnalysis?", program);

  test("schema is the record schema directly", () => {
    expect(protocol.schema.type).toBe("object");
    expect(protocol.schema.properties["type"]!.type).toBe("string");
    expect(protocol.schema.properties["confidence"]!.type).toBe("number");
  });

  test("schema required matches record fields", () => {
    expect(protocol.schema.required).toEqual(["type", "sentiment", "confidence"]);
  });

  test("extract injects __type", () => {
    const raw = { type: "report", sentiment: "positive", confidence: 0.9 };
    const result = protocol.extract(raw) as Record<string, unknown>;
    expect(result["__type"]).toBe("DocumentAnalysis");
  });

  test("extract preserves field values", () => {
    const raw = { type: "report", sentiment: "positive", confidence: 0.9 };
    const result = protocol.extract(raw) as Record<string, unknown>;
    expect(result["sentiment"]).toBe("positive");
  });
});

describe("deriveProtocol: primitive return type", () => {
  const program = parseProgram(protocolSrc);
  const protocol = deriveProtocol("String?", program);

  test("schema wraps in value envelope", () => {
    expect(protocol.schema.type).toBe("object");
    expect(protocol.schema.properties["value"]!.type).toBe("string");
    expect(protocol.schema.required).toEqual(["value"]);
  });

  test("extract unwraps value", () => {
    expect(protocol.extract({ value: "hello" })).toBe("hello");
  });
});

describe("deriveProtocol: user-defined predicate return type", () => {
  const srcWithPredicate = `
defpredicate PositiveNumber?
  signature: from [Number?(n)] to Boolean?;
  expression
    n > 0;
end
`;
  const program = parseProgram(srcWithPredicate);
  const protocol = deriveProtocol("PositiveNumber?", program);

  test("schema wraps in value envelope with base type", () => {
    expect(protocol.schema.properties["value"]!.type).toBe("number");
  });

  test("schema value description carries predicate constraint", () => {
    expect(protocol.schema.properties["value"]!.description).toContain("PositiveNumber?");
  });

  test("extract unwraps value", () => {
    expect(protocol.extract({ value: 42 })).toBe(42);
  });
});
