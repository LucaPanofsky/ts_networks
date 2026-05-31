// Tests for callLLMFn's tool-call loop. The Anthropic SDK is mocked so we can
// script the model's responses (tool_use rounds, end_turn, forced respond) and
// assert the request/response loop the call layer drives.

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

describe("callLLMFn — tool loop (Option B)", () => {
  it("runs a tool, feeds the result back, then forces respond", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResp([{ id: "t1", name: "echo", input: { x: "a" } }]))
      .mockResolvedValueOnce(endTurnResp())
      .mockResolvedValueOnce(respondResp({ value: "final" }));

    const out = await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    expect(out).toBe("final");
    expect(echoRun).toHaveBeenCalledWith({ x: "a" });
    expect(mockCreate).toHaveBeenCalledTimes(3);

    // Round 1: auto choice, real tools only (respond is NOT offered yet).
    const round1 = mockCreate.mock.calls[0]![0];
    expect(round1.tool_choice).toEqual({ type: "auto" });
    expect(round1.tools.map((t: { name: string }) => t.name)).toEqual(["echo"]);

    // Round 2's request carries the tool_result from round 1.
    const fedBack = lastTurn(1);
    expect(fedBack.role).toBe("user");
    expect(fedBack.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "t1",
      content: "echoed:a",
    });

    // Final call forces respond.
    const final = mockCreate.mock.calls[2]![0];
    expect(final.tool_choice).toEqual({ type: "tool", name: "respond" });
  });

  it("executes parallel tool calls from one turn in a single result turn", async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolUseResp([
          { id: "t1", name: "echo", input: { x: "a" } },
          { id: "t2", name: "echo", input: { x: "b" } },
        ]),
      )
      .mockResolvedValueOnce(endTurnResp())
      .mockResolvedValueOnce(respondResp({ value: "ok" }));

    await callLLMFn("p", {}, protocol, { tools: [echoTool] });

    expect(echoRun).toHaveBeenCalledTimes(2);
    const results = lastTurn(1).content;
    expect(results).toHaveLength(2);
    expect(results.map((r: { tool_use_id: string }) => r.tool_use_id).sort()).toEqual(["t1", "t2"]);
  });

  // Invariant — a throwing tool yields an is_error result and the loop continues.
  it("turns a throwing tool into an is_error result and keeps going", async () => {
    const boomRun = jest.fn(() => {
      throw new Error("boom");
    });
    const boomTool: LLMFnTool = { ...echoTool, name: "boom", run: boomRun };
    mockCreate
      .mockResolvedValueOnce(toolUseResp([{ id: "t1", name: "boom", input: { x: "a" } }]))
      .mockResolvedValueOnce(endTurnResp())
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
      .mockResolvedValueOnce(endTurnResp())
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
