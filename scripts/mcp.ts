#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../src/mcp/server.js";

// Entrypoint: serve the program-reasoning tools over stdio (the transport an MCP client
// — Claude Code / Desktop — spawns). Mirrors scripts/* as a thin runtime adapter, here
// over src/mcp/. stdout is the protocol channel: never write to it; diagnostics go to
// stderr. Configure a client with: command "npx", args ["tsx", "scripts/mcp.ts"].
async function main(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  // Runs until the client closes the transport.
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
