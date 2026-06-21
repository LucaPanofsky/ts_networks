import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
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
  const schema = buildSchemas(parseProgram(src))["Measurement"]!;

  test("schema structure", () => {
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["value", "label"]);
    expect(schema.properties["label"]!.type).toBe("string");
  });

  test("user-defined predicate field resolves to base type with description", () => {
    const prop = schema.properties["value"]!;
    expect(prop.type).toBe("number");
    expect(prop.description).toContain("PositiveNumber?");
    expect(prop.description).toContain("n > 0");
  });

  test("primitive field has no description", () => {
    expect(schema.properties["label"]!.description).toBeUndefined();
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

  test("nested field inlines as object with properties and required", () => {
    expect(innerProp.type).toBe("object");
    expect(innerProp.properties!["x"]!.type).toBe("number");
    expect(innerProp.properties!["label"]!.type).toBe("string");
    expect(innerProp.required).toEqual(["x", "label"]);
  });

  test("nested record field has no description", () => {
    expect(innerProp.description).toBeUndefined();
  });

  test("outer schema has its own required", () => {
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
  const schema = buildSchemas(parseProgram(src3))["Article"]!;

  test("vector fields map to array type", () => {
    expect(schema.properties["tags"]!.type).toBe("array");
    expect(schema.properties["scores"]!.type).toBe("array");
  });

  test("vector items schemas (record inlined, primitive typed)", () => {
    expect(schema.properties["tags"]!.items!.type).toBe("object");
    expect(schema.properties["tags"]!.items!.properties!["label"]!.type).toBe("string");
    expect(schema.properties["scores"]!.items!.type).toBe("number");
  });

  test("vector fields appear in required", () => {
    expect(schema.required).toContain("tags");
    expect(schema.required).toContain("scores");
  });
});

describe("buildSchemas: enum field in record", () => {
  const enumSrc = `
defenum DocumentType
  'report', 'email', 'legal', 'technical';
end

defrecord Payload
  docType: DocumentType?;
  label: String?;
end
`;
  const prop = buildSchemas(parseProgram(enumSrc))["Payload"]!.properties["docType"]!;

  test("enum field resolves to string type with enum constraint", () => {
    expect(prop.type).toBe("string");
    expect(prop.enum).toEqual(["report", "email", "legal", "technical"]);
  });

  test("enum field has no description", () => {
    expect(prop.description).toBeUndefined();
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
  const protocol = deriveProtocol({ kind: "scalar", predicate: "DocumentAnalysis?" }, parseProgram(protocolSrc));

  test("schema is the record schema with correct structure", () => {
    expect(protocol.schema.type).toBe("object");
    expect(protocol.schema.required).toEqual(["type", "sentiment", "confidence"]);
    expect(protocol.schema.properties["confidence"]!.type).toBe("number");
  });

  test("extract injects __type", () => {
    const result = protocol.extract({ type: "report", sentiment: "positive", confidence: 0.9 }) as Record<string, unknown>;
    expect(result["__type"]).toBe("DocumentAnalysis");
  });

  test("extract preserves field values", () => {
    const result = protocol.extract({ type: "report", sentiment: "positive", confidence: 0.9 }) as Record<string, unknown>;
    expect(result["sentiment"]).toBe("positive");
  });
});

describe("deriveProtocol: primitive return type", () => {
  const protocol = deriveProtocol({ kind: "scalar", predicate: "String?" }, parseProgram(protocolSrc));

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
  const protocol = deriveProtocol({ kind: "scalar", predicate: "PositiveNumber?" }, parseProgram(srcWithPredicate));

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

describe("deriveProtocol: enum return type", () => {
  const enumSrc = `
defenum DocumentType
  'report', 'email', 'legal', 'technical';
end
`;
  const protocol = deriveProtocol({ kind: "scalar", predicate: "DocumentType?" }, parseProgram(enumSrc));

  test("schema wraps enum in value envelope", () => {
    expect(protocol.schema.type).toBe("object");
    expect(protocol.schema.properties["value"]!.type).toBe("string");
    expect(protocol.schema.properties["value"]!.enum).toEqual(["report", "email", "legal", "technical"]);
    expect(protocol.schema.required).toEqual(["value"]);
  });

  test("extract unwraps value", () => {
    expect(protocol.extract({ value: "legal" })).toBe("legal");
  });
});

describe("deriveProtocol: vector return type", () => {
  const protocol = deriveProtocol({ kind: "vector", element: "DocumentAnalysis?" }, parseProgram(protocolSrc));

  test("schema wraps in items envelope with array type", () => {
    expect(protocol.schema.type).toBe("object");
    expect(protocol.schema.required).toEqual(["items"]);
    expect(protocol.schema.properties["items"]!.type).toBe("array");
  });

  test("items element schema is inlined record", () => {
    const itemSchema = protocol.schema.properties["items"]!.items!;
    expect(itemSchema.type).toBe("object");
    expect(itemSchema.properties!["sentiment"]!.type).toBe("string");
  });

  test("extract unwraps items", () => {
    const raw = { items: [{ type: "report", sentiment: "positive", confidence: 0.9 }] };
    expect(protocol.extract(raw)).toEqual(raw.items);
  });
});
