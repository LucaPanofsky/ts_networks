import { mcpTools, dispatch } from "../../src/mcp/tools.js";
import type { Operation } from "../../src/operations/types.js";

// The pure core of the MCP server: list the operations as MCP tools, and dispatch a
// call by name to an operation's handle. No SDK, no transport — these are the testable
// units. dispatch/mcpTools take the ops list as a defaulted parameter (the real
// `operations` array by default) so the unknown-tool and throw branches are injectable.

const VALID = `defrecord Point
  x: Number?;
  y: Number?;
end
`;

describe("mcpTools", () => {
  test("lists every operation as a tool with name, description, and schema", () => {
    const tools = mcpTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["parse", "check", "typecheck", "run", "compile-schemas", "run-grammar", "run-ttable"]),
    );
    for (const t of tools) {
      expect(typeof t.description).toBe("string");
      expect(t.inputSchema).toMatchObject({ type: "object" });
    }
  });
});

describe("dispatch: capabilities", () => {
  test("forwards args to the operation and returns its JSON as text content", async () => {
    const r = await dispatch("parse", { source: VALID });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({ ok: true });
  });

  test("awaits an async operation (run)", async () => {
    const source = `defn dbl
  signature: from [Number?(n)] to Number?;
  expression n * 2;
end

defnetwork d
  signature: from [n] to out;
  propagate dbl from [n] to out;
end
`;
    const r = await dispatch("run", { source, network: "d", cells: { n: "21" } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({ ok: true, cells: { out: 42 } });
  });
});

describe("dispatch: negative", () => {
  // A domain failure (ok:false) is IN-BAND content, not a tool error — the agent reads it
  // and self-corrects. isError is reserved for a thrown exception.
  test("an operation that returns ok:false is normal content, not isError", async () => {
    const r = await dispatch("parse", { source: "this is not valid tsn @@@" });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]!.text) as { ok: boolean };
    expect(parsed.ok).toBe(false);
  });

  test("an unknown tool name is an error result listing the available tools", async () => {
    const r = await dispatch("nope", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/unknown tool "nope"/);
    expect(r.content[0]!.text).toMatch(/parse/);
  });

  // The throw branch: a handler that throws becomes an isError result, never crashes the
  // server. Injected via the ops parameter so we do not depend on a real op throwing.
  test("a thrown exception in a handler becomes an isError result", async () => {
    const boom: Operation<unknown, unknown> = {
      name: "boom",
      description: "always throws",
      inputSchema: { type: "object", properties: {}, required: [] },
      handle: () => {
        throw new Error("kaboom");
      },
    };
    const r = await dispatch("boom", {}, [boom]);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/kaboom/);
  });
});
