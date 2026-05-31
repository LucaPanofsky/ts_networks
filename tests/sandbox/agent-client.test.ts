import { buildRequestParams } from "../../src/sandbox/agent-client.js";
import type { ResponseProtocol } from "../../src/data-network/schema.js";

const protocol: ResponseProtocol = {
  schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
  extract: raw => raw["value"],
};

describe("buildRequestParams — capabilities", () => {
  it("applies default model and a generous default max_tokens", () => {
    const p = buildRequestParams("hi", protocol, {});
    expect(p.model).toBe("claude-opus-4-7");
    expect(p.max_tokens).toBeGreaterThanOrEqual(16384);
  });

  it("honors an explicit model and maxTokens", () => {
    const p = buildRequestParams("hi", protocol, { model: "claude-haiku-4-5", maxTokens: 1024 });
    expect(p.model).toBe("claude-haiku-4-5");
    expect(p.max_tokens).toBe(1024);
  });

  it("wires the rendered prompt and the protocol schema into the respond tool", () => {
    const p = buildRequestParams("the prompt", protocol, {});
    expect(p.messages).toEqual([{ role: "user", content: "the prompt" }]);
    expect(p.tools?.[0]).toMatchObject({ name: "respond", input_schema: protocol.schema });
    expect(p.tool_choice).toEqual({ type: "any" });
  });
});

describe("buildRequestParams — invariants", () => {
  // temperature is deprecated and deliberately never sent — some models reject it.
  it("never sets temperature", () => {
    const p = buildRequestParams("hi", protocol, {});
    expect("temperature" in p).toBe(false);
  });

  // max_tokens must always be present (no ceiling => provider default, which is
  // the silent-truncation trap we are closing).
  it("always sets max_tokens", () => {
    expect(buildRequestParams("hi", protocol, {}).max_tokens).toBeDefined();
  });
});
