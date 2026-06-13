# Running the MCP server

The program-reasoning operations — `parse`, `check`, `typecheck`, `run`,
`compile-schemas`, `run-grammar`, `run-ttable` — are exposed to external agents over the
[Model Context Protocol](https://modelcontextprotocol.io). An MCP client (Claude Code,
Claude Desktop, or any MCP-capable agent) can call them as tools to author and refine
`.tsn` programs against the same checks a human uses.

This is the *authoring* loop. (The in-language loop — a `defllmfn` calling these same
tools mid-generation via `with: tools` — is documented in the
[Language Reference](../language.md#tools-under-development).) Both surfaces adapt the
single `operations/` layer, so the tools behave identically.

## Start it

```bash
npm run mcp          # serves over stdio
```

Equivalently: `npx tsx scripts/mcp.ts`. The server speaks JSON-RPC over **stdio** —
stdout is the protocol channel, so the process prints nothing else there; diagnostics go
to stderr. It runs until the client disconnects.

## Configure a client

Point the client at the script with `npx tsx`. For example, an MCP client config entry:

```json
{
  "mcpServers": {
    "ts-networks": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp.ts"],
      "cwd": "/absolute/path/to/ts_networks"
    }
  }
}
```

The `cwd` must be the repository root (the operations compile programs in-process).

## The tools

Every tool **returns its error as a value** rather than failing the call — the agent
reads the result and self-corrects. A call only comes back as a protocol error
(`isError`) if a handler throws unexpectedly.

| tool | input | returns |
| --- | --- | --- |
| `parse` | `source` | The parsed AST, or a syntax error. |
| `check` | `source` | Whether the program (including grammar bodies) is well-formed. |
| `typecheck` | `source` | Per-network cells and propagators with located type errors **and** topology warnings. |
| `compile-schemas` | `source` | A JSON Schema for every `defrecord`. |
| `run` | `source`, `network`, `cells` | The settled cell values after executing the network. |
| `run-grammar` | `source`, `grammar`, `input` | One `defgrammar` run against a sample: the parsed record / scanned records / matched span, or a located failure (the Ohm position on a mismatch). |
| `run-ttable` | `source`, `ttable`, `input` | One `TTable` run against a sample: the parsed rows (a malformed row appears as a per-row `{ __contradiction, reason }`), or a located failure. |

Adding an operation to `src/operations/` and the `operations` array exposes it through
this server, the CLI scripts, and the in-language registry at once — no per-surface
wiring.
