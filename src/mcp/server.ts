import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpTools, dispatch } from "./tools.js";

// The imperative shell: wire the pure core (mcpTools / dispatch) to an MCP `Server`.
// `ListTools` advertises every operation; `CallTool` delegates to dispatch by name. All
// logic, schemas, and error semantics live in tools.ts — this is glue only.
export function createMcpServer(): Server {
  const server = new Server(
    { name: "ts-networks", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools() }));
  server.setRequestHandler(CallToolRequestSchema, async req =>
    dispatch(req.params.name, req.params.arguments),
  );

  return server;
}
