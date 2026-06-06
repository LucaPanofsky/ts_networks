import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.js";

// End-to-end over an in-memory transport pair: a real MCP client talks to the server,
// proving the wiring (registration → list → call → result encoding). The dispatch logic
// itself is pinned in tools.test.ts; this exercises the SDK shell around it.
async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([createMcpServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const GRAMMAR_DSL = `defrecord CitationRec
  title: String?;
  section: String?;
end

defgrammar Citation
  signature: from [String?(text)] to CitationRec?;
  """
Citation {
  cite = title spaces "U.S.C." spaces "§" spaces section
  title = digit+
  section = digit+
}
"""
end
`;

describe("mcp server: round-trip over in-memory transport", () => {
  test("listTools advertises the program-reasoning operations", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name)).toEqual(
      expect.arrayContaining(["parse", "typecheck", "compile-schemas", "run", "run-grammar", "run-ttable"]),
    );
    // Each tool carries the operation's JSON Schema verbatim.
    expect(tools.find(t => t.name === "run-grammar")!.inputSchema).toMatchObject({ type: "object" });
  });

  test("callTool runs an operation and returns its result as text content", async () => {
    const client = await connectClient();
    const res = await client.callTool({
      name: "run-grammar",
      arguments: { source: GRAMMAR_DSL, grammar: "Citation", input: "17 U.S.C. § 106" },
    });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]!.text)).toMatchObject({
      ok: true,
      mode: "scalar",
      result: { __type: "CitationRec", title: "17", section: "106" },
    });
  });

  test("an unknown tool name comes back as an error result", async () => {
    const client = await connectClient();
    const res = await client.callTool({ name: "does-not-exist", arguments: {} });
    expect(res.isError).toBe(true);
  });
});
