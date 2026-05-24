import type { ProgramAST, RecordAST, FnAST, EnumAST, Expr, TypeRef } from "./types.js";

export type JsonSchemaType = "string" | "number" | "boolean" | "object" | "array";

export type JsonSchemaProperty = {
  type: JsonSchemaType;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  enum?: string[];
};

export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
};

export type ResponseProtocol = {
  schema: JsonSchemaObject;
  extract: (raw: Record<string, unknown>) => unknown;
};

// ── Internal indexes ──────────────────────────────────────────────────────────

type Indexes = {
  predicateIndex: Map<string, FnAST>;
  recordIndex: Map<string, RecordAST>;
  enumIndex: Map<string, EnumAST>;
};

function buildIndexes(program: ProgramAST): Indexes {
  return {
    predicateIndex: new Map(program.fns.filter(f => f.isPredicate).map(f => [f.name, f])),
    recordIndex:    new Map(program.records.map(r => [r.name, r])),
    enumIndex:      new Map(program.enums.map(e => [e.name, e])),
  };
}

// ── Schema resolution ─────────────────────────────────────────────────────────

const PRIMITIVE_MAP: Record<string, JsonSchemaType> = {
  "String?":  "string",
  "Number?":  "number",
  "Boolean?": "boolean",
};

function renderExpr(expr: Expr): string {
  switch (expr.kind) {
    case "literal": return String(expr.value);
    case "var":     return expr.name;
    case "binary":  return `${renderExpr(expr.left)} ${expr.op} ${renderExpr(expr.right)}`;
    case "unary":   return `${expr.op}${renderExpr(expr.expr)}`;
    case "field":   return `${renderExpr(expr.object)}.${expr.field}`;
    default:        return "...";
  }
}

function resolveProperty(
  predicate: string,
  indexes: Indexes,
): JsonSchemaProperty {
  const { predicateIndex, recordIndex, enumIndex } = indexes;

  const primitive = PRIMITIVE_MAP[predicate];
  if (primitive) return { type: primitive };

  const fn = predicateIndex.get(predicate);
  if (fn && fn.params[0] !== undefined) {
    const base = resolveProperty(fn.params[0].predicate, indexes);
    return { type: base.type, description: `${predicate} — satisfies: ${renderExpr(fn.body)}` };
  }

  const baseName = predicate.endsWith("?") ? predicate.slice(0, -1) : predicate;

  const enumDef = enumIndex.get(baseName);
  if (enumDef) return { type: "string", enum: enumDef.values };

  const nestedRecord = recordIndex.get(baseName);
  if (nestedRecord) {
    const nested = deriveSchema(nestedRecord, indexes);
    return { type: "object", properties: nested.properties, required: nested.required };
  }

  return { type: "string", description: predicate };
}

function resolveTypeRef(typeRef: TypeRef, indexes: Indexes): JsonSchemaProperty {
  if (typeRef.kind === "vector") {
    return { type: "array", items: resolveProperty(typeRef.element, indexes) };
  }
  return resolveProperty(typeRef.predicate, indexes);
}

export function deriveSchema(record: RecordAST, indexes: Indexes): JsonSchemaObject {
  const properties: Record<string, JsonSchemaProperty> = {};
  for (const field of record.fields) {
    properties[field.name] = resolveTypeRef(field.type, indexes);
  }
  return {
    type: "object",
    properties,
    required: record.fields.map(f => f.name),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildSchemas(program: ProgramAST): Record<string, JsonSchemaObject> {
  const indexes = buildIndexes(program);
  const schemas: Record<string, JsonSchemaObject> = {};
  for (const record of program.records) {
    schemas[record.name] = deriveSchema(record, indexes);
  }
  return schemas;
}

export function deriveProtocol(returnType: TypeRef, program: ProgramAST): ResponseProtocol {
  const indexes = buildIndexes(program);

  if (returnType.kind === "vector") {
    const items = resolveProperty(returnType.element, indexes);
    return {
      schema: {
        type: "object",
        properties: { items: { type: "array", items } },
        required: ["items"],
      },
      extract: (raw) => raw["items"],
    };
  }

  const baseName = returnType.predicate.endsWith("?")
    ? returnType.predicate.slice(0, -1)
    : returnType.predicate;

  const record = indexes.recordIndex.get(baseName);
  if (record) {
    return {
      schema: deriveSchema(record, indexes),
      extract: (raw) => ({ ...raw, __type: baseName }),
    };
  }

  // Primitive or user-defined predicate — wrap in { value } envelope
  const prop = resolveProperty(returnType.predicate, indexes);
  return {
    schema: {
      type: "object",
      properties: { value: prop },
      required: ["value"],
    },
    extract: (raw) => raw["value"],
  };
}
