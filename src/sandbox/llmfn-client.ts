import Anthropic from "@anthropic-ai/sdk";
import type { ResponseProtocol } from "../data-network/schema.js";
import type { LLMFnTool } from "./tools.js";
import { renderPrompt } from "./prompt-template.js";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// Opt-in tracing of the tool loop (set LLMFN_DEBUG=1). Writes to stderr so it
// never mixes with the structured result a caller reads from stdout.
const DEBUG = !!process.env["LLMFN_DEBUG"];
const debug = (...parts: unknown[]): void => {
  if (DEBUG) console.error("[llmfn]", ...parts);
};
const preview = (s: string, n = 200): string =>
  s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s;

export type LLMFnCallConfig = {
  model?: string;
  maxTokens?: number;
  // Tools the LLM function may call, resolved from the program's `with: tools`
  // clause and driven by the tool loop in callLLMFn.
  tools?: LLMFnTool[];
  // The optional `system` prompt — stable task framing. Sent on the `system` channel
  // (a trust boundary: instructions here, untrusted data in the user turn) and marked
  // cacheable, so it caches across calls instead of riding the volatile user turn.
  system?: string;
};

// The `system` request field, when a system prompt is present: a single cacheable text
// block. Below the model's min-cacheable-prefix it simply won't cache (harmless).
function systemField(
  system: string | undefined,
): Pick<Anthropic.MessageCreateParams, "system"> {
  if (!system) return {};
  return { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] };
}

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
    ...systemField(config.system),
    messages: [{ role: "user", content: prompt }],
    tools: [respondToolDef(protocol)],
    tool_choice: { type: "any" },
  };
  return params;
}

// Maximum tool-call rounds before we give up — guards against a model stuck in
// a tool loop running forever and burning budget.
const MAX_TOOL_ROUNDS = 10;

const respondToolDef = (protocol: ResponseProtocol): Anthropic.Tool => ({
  name: "respond",
  description:
    "Return the final structured response. Call this only when you have the complete " +
    "answer and need no further tools.",
  input_schema: protocol.schema as Anthropic.Tool["input_schema"],
});

const toolDefs = (tools: LLMFnTool[]): Anthropic.Tool[] =>
  tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool["input_schema"],
  }));

/**
 * Execute one batch of tool_use blocks and return their tool_result blocks. A
 * tool that throws (or whose name is unknown) becomes an `is_error` result
 * rather than aborting the loop, so the model can read the failure and adapt.
 */
async function runToolBatch(
  blocks: Anthropic.ToolUseBlock[],
  byName: Map<string, LLMFnTool>,
): Promise<Anthropic.ToolResultBlockParam[]> {
  return Promise.all(
    blocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
      debug(`  → ${block.name}(${preview(JSON.stringify(block.input ?? {}))})`);
      const tool = byName.get(block.name);
      if (!tool) {
        debug(`  ← ${block.name}: unknown tool`);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `unknown tool "${block.name}"`,
        };
      }
      try {
        const output = await tool.run(block.input as Record<string, unknown>);
        const content = typeof output === "string" ? output : JSON.stringify(output);
        debug(`  ← ${block.name}: ${preview(content)}`);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        debug(`  ← ${block.name}: ERROR ${message}`);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: message,
        };
      }
    }),
  );
}

/**
 * Agentic tool loop: `respond` is offered as a first-class tool alongside the LLM
 * function's own tools, under tool_choice "auto". The model calls real tools until
 * it has the answer, then calls `respond` — whose input IS the structured output,
 * returned IN-BAND with no extra round trip. A run needing k tool rounds therefore
 * costs k+1 calls, not k+2.
 *
 * Fallback: if the model instead ends with text (stop_reason != "tool_use") without
 * calling `respond`, one final forced-`respond` call coerces the structured output.
 *
 * Exceeding MAX_TOOL_ROUNDS without finishing is an error (mapped upstream to a
 * Contradiction): a model stuck in a tool loop should fail loudly, not return a
 * half-formed answer.
 */
async function runToolLoop(
  prompt: string,
  protocol: ResponseProtocol,
  config: LLMFnCallConfig,
  tools: LLMFnTool[],
): Promise<unknown> {
  const model = config.model ?? DEFAULT_MODEL;
  const max_tokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  // `respond` is offered from the start so the model can terminate the loop in-band.
  const defs = [...toolDefs(tools), respondToolDef(protocol)];
  const byName = new Map(tools.map(t => [t.name, t]));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  debug(`loop start — tools: [${tools.map(t => t.name).join(", ")}, respond]`);

  let endedWithoutRespond = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().messages.create({
      model,
      max_tokens,
      ...systemField(config.system),
      messages,
      tools: defs,
      tool_choice: { type: "auto" },
    });
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // In-band structured output: a `respond` call ends the loop immediately — no
    // extra forced call. It is terminal, so any co-requested real tools are ignored.
    const respondUse = toolUses.find(b => b.name === "respond");
    if (respondUse) {
      debug(`round ${round}: respond called in-band`);
      return protocol.extract(respondUse.input as Record<string, unknown>);
    }

    if (response.stop_reason !== "tool_use") {
      debug(`round ${round}: ended without respond (stop_reason=${response.stop_reason})`);
      endedWithoutRespond = true;
      break;
    }

    debug(
      `round ${round}: ${toolUses.length} tool call(s): ${toolUses.map(t => t.name).join(", ")}`,
    );
    // Append the assistant turn verbatim (the tool_use blocks must be preserved)
    // and answer every one in a single user turn.
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: await runToolBatch(toolUses, byName) });
  }

  if (!endedWithoutRespond) {
    throw new Error(
      `LLM function exceeded ${MAX_TOOL_ROUNDS} tool rounds without finishing`,
    );
  }

  // Fallback: the model ended with text instead of calling respond. Force it.
  debug("fallback: forcing respond to coerce the structured output");
  const final = await getClient().messages.create({
    model,
    max_tokens,
    ...systemField(config.system),
    messages,
    tools: defs,
    tool_choice: { type: "tool", name: "respond" },
  });
  const respondUse = final.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "respond",
  );
  if (!respondUse) {
    throw new Error(`LLM function did not return a respond tool_use block`);
  }
  return protocol.extract(respondUse.input as Record<string, unknown>);
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

  const tools = config.tools ?? [];

  // No tools: a single forced-respond call (behavior unchanged).
  if (tools.length === 0) {
    const params = buildRequestParams(rendered.prompt, protocol, config);
    const response = await getClient().messages.create(params);
    const toolUse = response.content.find(b => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`LLM function did not return a tool_use block`);
    }
    return protocol.extract(toolUse.input as Record<string, unknown>);
  }

  // Tools present: run the agentic loop, then coerce the structured output.
  return runToolLoop(rendered.prompt, protocol, config, tools);
}
