// The agent layer: a thin wrapper over the Claude Agent SDK that turns one user
// message into one assistant reply, carrying the conversation forward by session id.
//
// This is the ONLY module that imports the SDK. `server.mjs` depends on the
// `{ runTurn }` shape, not on the SDK — so the HTTP/SSE plumbing can be tested with a
// fake agent (see smoke-test.mjs) without an API key or the claude binary.
//
// v1 deliberately runs each turn as a single `query()` call resumed from the previous
// turn's session id (not the SDK's streaming-input mode). That is the simplest thing
// that is still a real SDK session: typed messages, in-process, resumable. Token-level
// streaming and a live tool-call trace are additive later (iterate the messages instead
// of only reading the final result).

import { execFileSync } from 'node:child_process';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildTurnOptions } from './options.mjs';

// Gavagai's identity, appended to (not replacing) Claude Code's default system prompt — Layer 1
// of the prompt strategy. Deliberately minimal: who he is and his two sources of expertise. The
// language know-how lives in the always-loaded ~/.claude/CLAUDE.md (Layer 2, the map), the
// authoring method in the on-demand authoring-tsn-programs skill (Layer 3), and the construct
// reference + worked examples in /knowledge (Layer 4). Each thing is said once, in the layer
// that loads it when it is needed. This append is static text, so the prompt cache stays warm.
const IDENTITY = `
You are Gavagai, an expert in the ts-networks language.

Your expertise stems from two sources:
- the language knowledge base
- the language tools and the workspace

You will use these tools and knowledge to assist the user, who will instruct you about what he expects from you.

The user talks to you through a UI. He may upload files, and you can produce outputs he can download — all inside your /workspace folder.
`.trim();

// Locate the claude executable the SDK should spawn. We reuse the globally-installed
// @anthropic-ai/claude-code binary already in the image rather than the SDK's own
// optional native binary (which we omit at install time to keep the image lean). An
// explicit TSN_CLAUDE_PATH wins; otherwise resolve `claude` on PATH. Returning undefined
// lets the SDK fall back to its built-in resolution (used in local dev if claude is on PATH).
function resolveClaudePath() {
  if (process.env.TSN_CLAUDE_PATH) return process.env.TSN_CLAUDE_PATH;
  try {
    const found = execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim();
    return found || undefined;
  } catch {
    return undefined;
  }
}

// Turn a tool_use block into a short, human-friendly activity line. Bash carries the command
// (the tsn-* verify loop runs through it), file tools carry a path; otherwise show the tool name.
function traceLabel(block) {
  const name = block.name || 'tool';
  if (name === 'Bash' && block.input?.command) return block.input.command.split('\n')[0].slice(0, 80);
  if (block.input?.file_path) return `${name} ${block.input.file_path}`;
  return name;
}

export function createSdkAgent(opts = {}) {
  const cwd = opts.cwd ?? process.env.TSN_WORKSPACE ?? '/workspace';
  const additionalDirectories = opts.additionalDirectories ?? ['/app/ts-networks', '/knowledge'];
  const append = opts.systemPromptAppend ?? IDENTITY;
  const pathToClaudeCodeExecutable = opts.claudePath ?? resolveClaudePath();

  // Per-turn options come from the pure builder (options.mjs). `resume` carries the
  // conversation; on the first turn there is no session yet, so it is omitted.
  const optionsFor = (sessionId) =>
    buildTurnOptions({ sessionId, cwd, additionalDirectories, append, claudePath: pathToClaudeCodeExecutable });

  return {
    /**
     * Run one turn. Returns { text, sessionId }. `text` is the assistant's final reply;
     * `sessionId` is the (possibly new) id to pass to the next turn.
     */
    async runTurn({ prompt, sessionId, onTrace }) {
      let text = '';
      let nextSessionId = sessionId;
      for await (const message of query({ prompt, options: optionsFor(sessionId) })) {
        // Every message carries the session id; capture it as soon as we see it so a
        // mid-turn failure still advances the conversation correctly.
        if (message.session_id) nextSessionId = message.session_id;
        // Live trace (Rung 1): surface each tool the agent runs as it happens. We already
        // iterate every SDK message; previously we kept only the final result.
        if (message.type === 'assistant' && onTrace) {
          for (const block of message.message?.content ?? []) {
            if (block.type === 'tool_use') onTrace(traceLabel(block));
          }
        }
        if (message.type === 'result') {
          if (message.subtype === 'success') {
            text = message.result ?? '';
          } else {
            throw new Error(`agent turn ended without success (subtype: ${message.subtype})`);
          }
        }
      }
      return { text, sessionId: nextSessionId };
    },
  };
}
