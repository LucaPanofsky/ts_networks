import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { buildSchemas } from "../../src/data-network/schema.js";

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
