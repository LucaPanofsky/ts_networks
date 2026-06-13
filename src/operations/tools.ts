// The full in-language tool registry: the self-contained `parse` tool (from the
// sandbox) plus the program-reasoning operations adapted as tools. This lives in
// the OPERATIONS layer — not the sandbox — because adapting an operation requires
// importing it, and operations sit above the sandbox. Keeping these adapters here
// is what breaks the operations↔sandbox cycle: the sandbox knows only `parse`
// (SANDBOX_TOOLS) and this richer resolver is INJECTED into compile via
// `operations/run.ts` (see `ToolResolver`).
//
// An `Operation` already IS a tool, field-for-field — name, description,
// JSON-Schema input, handler — so each adapter is a thin coercion of tool inputs
// onto the operation's input shape. The operation owns the logic, schema, and
// description (single source of truth); errors are returned as values, not thrown.

import {
  parseTool,
  resolveTools as resolveIn,
  toolsFromConfig as fromConfigIn,
  availableToolNames as namesIn,
  type LLMFnTool,
  type ToolInput,
  type ToolRegistry,
} from "../sandbox/tools.js";
import type { Operation } from "./types.js";
import { runGrammar } from "./run-grammar.js";
import { runTtable } from "./run-ttable.js";
import { typecheck } from "./typecheck.js";
import { compileSchemas } from "./compile-schemas.js";
import { run } from "./run.js";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function coerceCells(raw: unknown): Record<string, string> {
  const cells: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) cells[k] = str(v);
  }
  return cells;
}

// Adapt an operation to a tool: the operation owns the logic, schema, and description;
// the adapter only coerces tool inputs and forwards.
function adaptOp<I, O>(op: Operation<I, O>, coerce: (input: ToolInput) => I): LLMFnTool {
  return {
    name: op.name,
    description: op.description,
    input_schema: op.inputSchema,
    run: (input: ToolInput) => op.handle(coerce(input)),
  };
}

// Built LAZILY, on first use. This module and `operations/run.ts` form an
// intra-operations import cycle (run.ts injects this resolver into compile; this
// module adapts the `run` operation as a tool). Reading `run.name` etc. at module-init
// would hit the not-yet-initialized binding (TDZ). Deferring construction to first
// resolution moves every operation-metadata read to runtime, by when all modules are
// initialized. (This is an operations-INTERNAL reference; the operations↔sandbox
// module cycle is gone — the sandbox no longer imports anything here.)
//
// What each operation-backed tool gives the model:
//   run-grammar     — test one defgrammar against a sample; the located Ohm failure on a
//                     mismatch is the point, not a pass/fail bit (the grammar-authoring tool).
//   run-ttable      — the tabular twin: test one TTable against a sample, surfacing per-row
//                     contradictions and located header mismatches.
//   typecheck       — wiring soundness: located type errors AND topology warnings (the
//                     highest-signal authoring tool — "does it hold together", not just "parses").
//   compile-schemas — the JSON Schema per defrecord, i.e. the structured-output contract.
//   run             — compile and EXECUTE a network with seeded cells (end-to-end ground
//                     truth). It evaluates the program's sandbox JS — same trust boundary as
//                     the program itself; flagged because the model invokes it unattended.
let CACHE: ToolRegistry | null = null;
function programTools(): ToolRegistry {
  if (CACHE) return CACHE;
  const tools: LLMFnTool[] = [
    parseTool,
    adaptOp(runGrammar, i => ({ source: str(i.source), grammar: str(i.grammar), input: str(i.input) })),
    adaptOp(runTtable, i => ({ source: str(i.source), ttable: str(i.ttable), input: str(i.input) })),
    adaptOp(typecheck, i => ({ source: str(i.source) })),
    adaptOp(compileSchemas, i => ({ source: str(i.source) })),
    adaptOp(run, i => ({ source: str(i.source), network: str(i.network), cells: coerceCells(i.cells) })),
  ];
  CACHE = Object.fromEntries(tools.map(t => [t.name, t]));
  return CACHE;
}

/** Resolve tool names against the full program-reasoning registry. Throws on the first unknown name. */
export function resolveTools(names: string[]): LLMFnTool[] {
  return resolveIn(names, programTools());
}

/** Parse a raw `with: tools` value and resolve it against the full registry. Injected into compile. */
export function toolsFromConfig(raw: string | undefined): LLMFnTool[] {
  return fromConfigIn(raw, programTools());
}

/** Names of all program-reasoning tools (for diagnostics / docs). */
export function availableToolNames(): string[] {
  return namesIn(programTools());
}
