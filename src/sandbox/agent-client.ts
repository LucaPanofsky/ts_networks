import Anthropic from "@anthropic-ai/sdk";
import type { ResponseProtocol } from "../data-network/schema.js";
import { renderPrompt } from "./prompt-template.js";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export type AgentCallConfig = {
  model?: string;
  temperature?: number;
};

export async function callAgent(
  promptTemplate: string,
  args: Record<string, unknown>,
  protocol: ResponseProtocol,
  config: AgentCallConfig = {},
): Promise<unknown> {
  const rendered = renderPrompt(promptTemplate, args);
  if (!rendered.ok) {
    throw new Error(
      `prompt references undefined variable(s): ${rendered.missing.join(", ")}`,
    );
  }
  const prompt = rendered.prompt;
  const model = config.model ?? "claude-opus-4-7";
  const temperature = config.temperature ?? 1;

  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    temperature,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "respond",
        description: "Return the structured response",
        input_schema: protocol.schema as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "any" },
  });

  const toolUse = response.content.find(b => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Agent did not return a tool_use block`);
  }

  return protocol.extract(toolUse.input as Record<string, unknown>);
}
