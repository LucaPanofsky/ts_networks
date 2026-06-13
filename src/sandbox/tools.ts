// Host-provided tools that an LLM function may call.
//
// Tools are TypeScript capabilities, not DSL constructs. A .tsn program selects
// which tools an LLM function may use by name, via `with: tools = 'a, b'`; the
// implementations live here. The call layer (llmfn-client) turns the resolved
// tools into the definitions it sends to the Claude API and executes when the
// model calls them — that loop is a separate step; this module only defines the
// tools and resolves names to them.
//
// LAYERING: this module is in the `sandbox` layer and must NOT import `operations`
// (operations sit ABOVE the sandbox and compile/run it — importing them here would
// re-create the operations↔sandbox cycle). It therefore knows only the ONE
// self-contained tool, `parse`. The richer program-reasoning tools (run-grammar,
// typecheck, run, …) are operation-backed; they live in `operations/tools.ts` and
// are INJECTED into the sandbox at compile time (see `ToolResolver`,
// `buildRegistry`, `compile`). Resolution itself is generic over a registry, so
// both layers reuse the exact same code — only the registry they pass differs.

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

/** A name→tool lookup. Both the sandbox (parse-only) and operations (full) layers use this shape. */
export type ToolRegistry = Record<string, LLMFnTool>;

/** Turns a raw `with: tools` string into resolved tools. Injected into compile by the caller. */
export type ToolResolver = (raw: string | undefined) => LLMFnTool[];

// ── tools ───────────────────────────────────────────────────────────────────

// `parse` lets the model check that .tsn source it produced is syntactically
// valid before returning it. Errors are returned as a value, never thrown — the
// model is expected to read the result and react. It is self-contained (only the
// parser), so it lives here in the sandbox layer with no operation dependency.
export const parseTool: LLMFnTool = {
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

/** The sandbox-layer registry: only the self-contained `parse` tool. */
export const SANDBOX_TOOLS: ToolRegistry = { [parseTool.name]: parseTool };

// ── selection (generic over a registry) ──────────────────────────────────────

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

/** Resolve tool names against a registry (default: the sandbox's). Throws on the first unknown name. */
export function resolveTools(names: string[], reg: ToolRegistry = SANDBOX_TOOLS): LLMFnTool[] {
  return names.map(name => {
    const tool = reg[name];
    if (tool === undefined) {
      const known = Object.keys(reg).join(", ") || "(none)";
      throw new Error(`unknown tool "${name}" — available tools: ${known}`);
    }
    return tool;
  });
}

/** Convenience: parse a raw `with: tools` value and resolve it against a registry in one step. */
export function toolsFromConfig(
  raw: string | undefined,
  reg: ToolRegistry = SANDBOX_TOOLS,
): LLMFnTool[] {
  return resolveTools(parseToolList(raw ?? ""), reg);
}

/** Names of all tools in a registry (default: the sandbox's) — for diagnostics / docs. */
export function availableToolNames(reg: ToolRegistry = SANDBOX_TOOLS): string[] {
  return Object.keys(reg);
}
