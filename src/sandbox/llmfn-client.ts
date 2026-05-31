import Anthropic from "@anthropic-ai/sdk";
import type { ResponseProtocol } from "../data-network/schema.js";
import type { LLMFnTool } from "./tools.js";
import { renderPrompt } from "./prompt-template.js";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export type LLMFnCallConfig = {
  model?: string;
  maxTokens?: number;
  // Tools the LLM function may call. Resolved from the program's `with: tools`
  // clause; not yet exercised by callLLMFn (the tool loop is a separate step).
  tools?: LLMFnTool[];
};

const DEFAULT_MODEL = "claude-opus-4-7";
// Structured outputs (e.g. a full classification record) are large; a low ceiling
// silently truncates the tool result. Default generously; override via the LLM
// function's `with:` clause when needed.
const DEFAULT_MAX_TOKENS = 16384;

/**
 * Build the Messages request from a rendered prompt, a response protocol, and the
 * LLM function config. Pure and side-effect free so it can be unit-tested without the SDK.
 * `temperature` is deliberately never sent — it is deprecated and some models
 * reject it outright.
 */
export function buildRequestParams(
  prompt: string,
  protocol: ResponseProtocol,
  config: LLMFnCallConfig,
): Anthropic.MessageCreateParamsNonStreaming {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: config.model ?? DEFAULT_MODEL,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "respond",
        description: "Return the structured response",
        input_schema: protocol.schema as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "any" },
  };
  return params;
}

export async function callLLMFn(
  promptTemplate: string,
  args: Record<string, unknown>,
  protocol: ResponseProtocol,
  config: LLMFnCallConfig = {},
): Promise<unknown> {
  const rendered = renderPrompt(promptTemplate, args);
  if (!rendered.ok) {
    throw new Error(
      `prompt references undefined variable(s): ${rendered.missing.join(", ")}`,
    );
  }

  const params = buildRequestParams(rendered.prompt, protocol, config);
  const response = await getClient().messages.create(params);

  const toolUse = response.content.find(b => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`LLM function did not return a tool_use block`);
  }

  return protocol.extract(toolUse.input as Record<string, unknown>);
}
