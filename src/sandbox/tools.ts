// Host-provided tools that an LLM function may call.
//
// Tools are TypeScript capabilities, not DSL constructs. A .tsn program selects
// which tools an LLM function may use by name, via `with: tools = 'a, b'`; the
// implementations live here. The call layer (llmfn-client) turns the resolved
// tools into the definitions it sends to the Claude API and executes when the
// model calls them — that loop is a separate step; this module only defines the
// tools and resolves names to them.

import { parseProgram } from "../data-network/tree-to-network.js";
import { runGrammar } from "../operations/run-grammar.js";
import { runTtable } from "../operations/run-ttable.js";
import { typecheck } from "../operations/typecheck.js";
import { compileSchemas } from "../operations/compile-schemas.js";
import { run } from "../operations/run.js";
import type { Operation } from "../operations/types.js";

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

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// Adapt an operation to a tool: the operation owns the logic, schema, and description
// (single source of truth); the adapter only coerces tool inputs and forwards. Errors
// are returned as values by the operations, never thrown.
function adaptOp<I, O>(op: Operation<I, O>, coerce: (input: ToolInput) => I): LLMFnTool {
  return {
    name: op.name,
    description: op.description,
    input_schema: op.inputSchema,
    run: (input: ToolInput) => op.handle(coerce(input)),
  };
}

function coerceCells(raw: unknown): Record<string, string> {
  const cells: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) cells[k] = str(v);
  }
  return cells;
}

// The registry is built LAZILY, on first selection. The operation-backed tools import
// `run`, whose module pulls jsgen → registry → llmfn-client → back to this module — a
// cycle. Reading `run.name`/etc. at module-init time would hit the not-yet-initialized
// binding (TDZ). Deferring construction to first use moves every operation-metadata
// read to runtime, by when all modules are initialized. parseTool stays eager (it is
// self-contained — no operation import, no cycle).
//
// What each operation-backed tool gives the model:
//   run-grammar     — test one defgrammar against a sample; the located Ohm failure on a
//                     mismatch is the point, not a pass/fail bit (the grammar-induction tool).
//   run-ttable      — the tabular twin: test one TTable against a sample, surfacing per-row
//                     contradictions and located header mismatches.
//   typecheck       — wiring soundness: located type errors AND topology warnings (the
//                     highest-signal authoring tool — "does it hold together", not just "parses").
//   compile-schemas — the JSON Schema per defrecord, i.e. the structured-output contract.
//   run             — compile and EXECUTE a network with seeded cells (end-to-end ground
//                     truth). It evaluates the program's sandbox JS — same trust boundary as
//                     the program itself; flagged because the model invokes it unattended.
let REGISTRY_CACHE: Record<string, LLMFnTool> | null = null;
function registry(): Record<string, LLMFnTool> {
  if (REGISTRY_CACHE) return REGISTRY_CACHE;
  const tools: LLMFnTool[] = [
    parseTool,
    adaptOp(runGrammar, i => ({ source: str(i.source), grammar: str(i.grammar), input: str(i.input) })),
    adaptOp(runTtable, i => ({ source: str(i.source), ttable: str(i.ttable), input: str(i.input) })),
    adaptOp(typecheck, i => ({ source: str(i.source) })),
    adaptOp(compileSchemas, i => ({ source: str(i.source) })),
    adaptOp(run, i => ({ source: str(i.source), network: str(i.network), cells: coerceCells(i.cells) })),
  ];
  REGISTRY_CACHE = Object.fromEntries(tools.map(t => [t.name, t]));
  return REGISTRY_CACHE;
}

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
  const reg = registry();
  return names.map(name => {
    const tool = reg[name];
    if (tool === undefined) {
      const known = Object.keys(reg).join(", ") || "(none)";
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
  return Object.keys(registry());
}
