import { operations } from "../operations/index.js";
import type { Operation } from "../operations/types.js";

// The pure core of the MCP server, free of the SDK and any transport. An `Operation`
// already carries everything an MCP tool needs (name, description, JSON-Schema input),
// so the server is a generic adapter over the `operations` array — add an operation
// there and it appears here, in the CLI, and in the in-language registry, no extra wiring.
//
// The ops list is a defaulted parameter so the dispatch branches (unknown tool, a handler
// that throws) are testable by injection without touching the real singleton.

export type McpToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };
type TextContent = { type: "text"; text: string };
export type McpToolResult = { content: TextContent[]; isError?: boolean };

const text = (s: string): TextContent => ({ type: "text", text: s });

export function mcpTools(ops: Operation<unknown, unknown>[] = operations): McpToolDef[] {
  return ops.map(op => ({
    name: op.name,
    description: op.description,
    inputSchema: op.inputSchema as Record<string, unknown>,
  }));
}

export async function dispatch(
  name: string,
  args: Record<string, unknown> | undefined,
  ops: Operation<unknown, unknown>[] = operations,
): Promise<McpToolResult> {
  const op = ops.find(o => o.name === name);
  if (!op) {
    return { content: [text(`unknown tool "${name}" — available tools: ${ops.map(o => o.name).join(", ")}`)], isError: true };
  }
  try {
    // An operation returns its failure as a value (`{ ok: false, error }`); that is normal
    // content the agent reads and self-corrects on — NOT an isError. isError is reserved
    // for a thrown exception (a bug), so the server never dies on a bad call.
    const result = await op.handle(args ?? {});
    return { content: [text(typeof result === "string" ? result : JSON.stringify(result))] };
  } catch (e) {
    return { content: [text(e instanceof Error ? e.message : String(e))], isError: true };
  }
}
