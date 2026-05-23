import type { ProgramAST, RecordAST, FnAST, Expr, TypeRef } from "./types.js";

export type JsonSchemaType = "string" | "number" | "boolean" | "object" | "array";

export type JsonSchemaProperty = {
  type: JsonSchemaType;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
};

export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
};

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
  predicateIndex: Map<string, FnAST>,
  recordIndex: Map<string, RecordAST>,
): JsonSchemaProperty {
  const primitive = PRIMITIVE_MAP[predicate];
  if (primitive) return { type: primitive };

  const fn = predicateIndex.get(predicate);
  if (fn && fn.params[0] !== undefined) {
    const base = resolveProperty(fn.params[0].predicate, predicateIndex, recordIndex);
    return { type: base.type, description: `${predicate} — satisfies: ${renderExpr(fn.body)}` };
  }

  const baseName = predicate.endsWith("?") ? predicate.slice(0, -1) : predicate;
  const nestedRecord = recordIndex.get(baseName);
  if (nestedRecord) {
    const nested = deriveSchema(nestedRecord, predicateIndex, recordIndex);
    return { type: "object", properties: nested.properties, required: nested.required };
  }

  return { type: "string", description: predicate };
}

function resolveTypeRef(
  typeRef: TypeRef,
  predicateIndex: Map<string, FnAST>,
  recordIndex: Map<string, RecordAST>,
): JsonSchemaProperty {
  if (typeRef.kind === "vector") {
    return { type: "array", items: resolveProperty(typeRef.element, predicateIndex, recordIndex) };
  }
  return resolveProperty(typeRef.predicate, predicateIndex, recordIndex);
}

export function deriveSchema(
  record: RecordAST,
  predicateIndex: Map<string, FnAST>,
  recordIndex: Map<string, RecordAST>,
): JsonSchemaObject {
  const properties: Record<string, JsonSchemaProperty> = {};
  for (const field of record.fields) {
    properties[field.name] = resolveTypeRef(field.type, predicateIndex, recordIndex);
  }
  return {
    type: "object",
    properties,
    required: record.fields.map(f => f.name),
  };
}

export function buildSchemas(program: ProgramAST): Record<string, JsonSchemaObject> {
  const predicateIndex = new Map<string, FnAST>(
    program.fns.filter(f => f.isPredicate).map(f => [f.name, f])
  );
  const recordIndex = new Map<string, RecordAST>(program.records.map(r => [r.name, r]));

  const schemas: Record<string, JsonSchemaObject> = {};
  for (const record of program.records) {
    schemas[record.name] = deriveSchema(record, predicateIndex, recordIndex);
  }
  return schemas;
}
