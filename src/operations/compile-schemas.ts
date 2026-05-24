import { parseProgram } from "../data-network/tree-to-network.js";
import { buildSchemas } from "../data-network/schema.js";
import type { JsonSchemaObject } from "../data-network/schema.js";
import type { Operation } from "./types.js";

type CompileSchemasInput = { source: string };
type CompileSchemasOutput =
  | { ok: true; schemas: Record<string, JsonSchemaObject> }
  | { ok: false; error: string };

export const compileSchemas: Operation<CompileSchemasInput, CompileSchemasOutput> = {
  name: "compile-schemas",
  description: "Parse a ts-networks program and emit a JSON Schema object for every defrecord.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code." },
    },
    required: ["source"],
  },
  handle(input) {
    try {
      const program = parseProgram(input.source);
      return { ok: true, schemas: buildSchemas(program) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
