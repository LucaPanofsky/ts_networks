// Host-provided tools that an LLM function may call.
//
// Tools are TypeScript capabilities, not DSL constructs. A .tsn program selects
// which tools an LLM function may use by name, via `with: tools = 'a, b'`; the
// implementations live here. The call layer (llmfn-client) turns the resolved
// tools into the definitions it sends to the Claude API and executes when the
// model calls them — that loop is a separate step; this module only defines the
// tools and resolves names to them.

import { parseProgram } from "../data-network/tree-to-network.js";

export type ToolInput = Record<string, unknown>;

// Minimal JSON Schema shape for a tool's input. Kept local so this module does
// not depend on the SDK; the call layer casts it to the SDK's input_schema type.
export type ToolInputSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
};

export type LLMFnTool = {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
  run: (input: ToolInput) => unknown | Promise<unknown>;
};

// ── tools ───────────────────────────────────────────────────────────────────

// `parse` lets the model check that .tsn source it produced is syntactically
// valid before returning it. Errors are returned as a value, never thrown — the
// model is expected to read the result and react.
const parseTool: LLMFnTool = {
  name: "parse",
  description:
    "Check whether a ts-networks (.tsn) program parses without syntax errors. " +
    "Use it to validate DSL source you wrote before returning it. Returns " +
    '{ "ok": true } if it parses, or { "ok": false, "error": <message> } if not.',
  input_schema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The full .tsn program source to check." },
    },
    required: ["source"],
  },
  run: (input: ToolInput) => {
    const source = typeof input.source === "string" ? input.source : "";
    try {
      parseProgram(source);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

const REGISTRY: Record<string, LLMFnTool> = {
  [parseTool.name]: parseTool,
};

// ── selection ───────────────────────────────────────────────────────────────

/**
 * Split a `with: tools = '...'` value into tool names: comma-separated, trimmed,
 * empties dropped, order-preserving, de-duplicated. Total — `""` yields `[]`.
 */
export function parseToolList(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(",")) {
    const name = part.trim();
    if (name.length > 0 && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/** Resolve tool names against the registry. Throws on the first unknown name. */
export function resolveTools(names: string[]): LLMFnTool[] {
  return names.map(name => {
    const tool = REGISTRY[name];
    if (tool === undefined) {
      const known = Object.keys(REGISTRY).join(", ") || "(none)";
      throw new Error(`unknown tool "${name}" — available tools: ${known}`);
    }
    return tool;
  });
}

/** Convenience: parse a raw `with: tools` value and resolve it in one step. */
export function toolsFromConfig(raw: string | undefined): LLMFnTool[] {
  return resolveTools(parseToolList(raw ?? ""));
}

/** Names of all registered tools (for diagnostics / docs). */
export function availableToolNames(): string[] {
  return Object.keys(REGISTRY);
}
