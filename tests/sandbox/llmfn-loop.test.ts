// Tests for callLLMFn's tool-call loop. The Anthropic SDK is mocked so we can
// script the model's responses (tool_use rounds, end_turn, in-band respond) and
// assert the request/response loop the call layer drives.
//
// Design: `respond` is a first-class tool offered in the loop from the start. The
// model calls it in-band when done, so structured output returns WITHOUT an extra
// round trip — a tools-llmfn that needs k tool rounds costs k+1 calls, not k+2. A
// forced `respond` call is kept only as a FALLBACK for when the model ends with
// text instead of calling respond.

const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: class {
    messages = { create: mockCreate };
  },
}));

import { callLLMFn } from "../../src/sandbox/llmfn-client.js";
import type { ResponseProtocol } from "../../src/data-network/schema.js";
import type { LLMFnTool } from "../../src/sandbox/tools.js";

const protocol: ResponseProtocol = {
  schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
  extract: raw => raw["value"],
};

// Minimal stand-ins for Anthropic SDK Message responses (only the fields the
// loop reads: stop_reason + content).
const toolUseResp = (uses: Array<{ id: string; name: string; input: unknown }>) =>
  ({ stop_reason: "tool_use", content: uses.map(u => ({ type: "tool_use", ...u })) }) as never;
const endTurnResp = () =>
  ({ stop_reason: "end_turn", content: [{ type: "text", text: "done" }] }) as never;
const respondResp = (value: unknown) =>
  ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "r0", name: "respond", input: value }] }) as never;

const echoRun = jest.fn((input: Record<string, unknown>) => `echoed:${String(input["x"])}`);
const echoTool: LLMFnTool = {
  name: "echo",
  description: "echo x",
  input_schema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
  run: echoRun,
};

const toolNames = (callIndex: number): string[] =>
  mockCreate.mock.calls[callIndex]![0].tools.map((t: { name: string }) => t.name);
// Pull the last message turn out of a captured create() call.
const lastTurn = (callIndex: number): any =>
  mockCreate.mock.calls[callIndex]![0].messages.at(-1);

beforeEach(() => {
  mockCreate.mockReset();
  echoRun.mockClear();
});

describe("callLLMFn — no tools (unchanged single-shot)", () => {
  it("forces the respond tool in one call and extracts the result", async () => {
    mockCreate.mockResolvedValueOnce(respondResp({ value: "hi" }));

    const out = await callLLMFn("p", {}, protocol, {});

    expect(out).toBe("hi");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const params = mockCreate.mock.calls[0]![0];
    expect(params.tool_choice).toEqual({ type: "any" });
    expect(params.tools.map((t: { name: string }) => t.name)).toEqual(["respond"]);
  });
});

describe("callLLMFn — tool loop: respond is in-band (k+1 calls)", () => {
  it("offers respond alongside the real tools from the first round", async () => {
    mockCreate.mockResolvedValueOnce(respondResp({ value: "x" }));

    await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    expect(mockCreate.mock.calls[0]![0].tool_choice).toEqual({ type: "auto" });
    expect(toolNames(0)).toEqual(["echo", "respond"]);
  });

  it("one tool round then in-band respond costs 2 calls, not 3", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResp([{ id: "t1", name: "echo", input: { x: "a" } }]))
      .mockResolvedValueOnce(respondResp({ value: "final" }));

    const out = await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    expect(out).toBe("final");
    expect(echoRun).toHaveBeenCalledWith({ x: "a" });
    // k = 1 tool round → k + 1 = 2 calls (was 3 under the forced-final design).
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // No forced respond turn — every call uses auto tool_choice.
    expect(mockCreate.mock.calls.every(c => c[0].tool_choice.type === "auto")).toBe(true);
    // Round 2 carries the tool_result fed back from round 1.
    const fedBack = lastTurn(1);
    expect(fedBack.role).toBe("user");
    expect(fedBack.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "echoed:a" });
  });

  it("k tool rounds cost k+1 calls (invariant over k)", async () => {
    for (const k of [0, 1, 3]) {
      mockCreate.mockReset();
      echoRun.mockClear();
      for (let i = 0; i < k; i++) {
        mockCreate.mockResolvedValueOnce(toolUseResp([{ id: `t${i}`, name: "echo", input: { x: String(i) } }]));
      }
      mockCreate.mockResolvedValueOnce(respondResp({ value: "ok" }));

      const out = await callLLMFn("p", {}, protocol, { tools: [echoTool] });

      expect(out).toBe("ok");
      expect(mockCreate).toHaveBeenCalledTimes(k + 1);
    }
  });

  it("a turn with respond AND a real tool takes respond (terminal); the real tool is not run", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResp([
        { id: "t1", name: "echo", input: { x: "a" } },
        { id: "r0", name: "respond", input: { value: "inband" } },
      ]),
    );

    const out = await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    expect(out).toBe("inband");
    expect(echoRun).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("executes parallel tool calls from one turn in a single result turn", async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolUseResp([
          { id: "t1", name: "echo", input: { x: "a" } },
          { id: "t2", name: "echo", input: { x: "b" } },
        ]),
      )
      .mockResolvedValueOnce(respondResp({ value: "ok" }));

    await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    expect(echoRun).toHaveBeenCalledTimes(2);
    const results = lastTurn(1).content;
    expect(results).toHaveLength(2);
    expect(results.map((r: { tool_use_id: string }) => r.tool_use_id).sort()).toEqual(["t1", "t2"]);
  });
});

describe("callLLMFn — tool loop: fallback + failure modes", () => {
  // Fallback — the model ends with text instead of calling respond; a forced
  // respond call still coerces the structured output.
  it("falls back to a forced respond when the model ends with text", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResp([{ id: "t1", name: "echo", input: { x: "a" } }]))
      .mockResolvedValueOnce(endTurnResp())
      .mockResolvedValueOnce(respondResp({ value: "coerced" }));

    const out = await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    expect(out).toBe("coerced");
    expect(mockCreate).toHaveBeenCalledTimes(3);
    const final = mockCreate.mock.calls[2]![0];
    expect(final.tool_choice).toEqual({ type: "tool", name: "respond" });
  });

  // Invariant — a throwing tool yields an is_error result and the loop continues.
  it("turns a throwing tool into an is_error result and keeps going", async () => {
    const boomRun = jest.fn(() => {
      throw new Error("boom");
    });
    const boomTool: LLMFnTool = { ...echoTool, name: "boom", run: boomRun };
    mockCreate
      .mockResolvedValueOnce(toolUseResp([{ id: "t1", name: "boom", input: { x: "a" } }]))
      .mockResolvedValueOnce(respondResp({ value: "recovered" }));

    const out = await callLLMFn("p", {}, protocol, { tools: [boomTool] });

    expect(out).toBe("recovered");
    const result = lastTurn(1).content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1", is_error: true });
    expect(String(result.content)).toMatch(/boom/);
  });

  // Negative — the model asks for a tool the function doesn't expose.
  it("reports an unknown requested tool as is_error rather than crashing", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResp([{ id: "t1", name: "ghost", input: {} }]))
      .mockResolvedValueOnce(respondResp({ value: "ok" }));

    await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    const result = lastTurn(1).content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1", is_error: true });
    expect(String(result.content)).toMatch(/unknown tool "ghost"/);
  });

  // Negative — a model that never stops calling tools fails loudly at the cap.
  it("throws when the tool-round cap is exceeded", async () => {
    mockCreate.mockResolvedValue(toolUseResp([{ id: "t1", name: "echo", input: { x: "a" } }]));

    await expect(callLLMFn("p", {}, protocol, { tools: [echoTool] })).rejects.toThrow(
      /tool rounds without finishing/,
    );
  });
});
