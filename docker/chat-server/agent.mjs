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

// The interactive contract, appended to (not replacing) Claude Code's default system
// prompt so the always-loaded agent-home CLAUDE.md and its principles still apply. The
// principle file stays mode-agnostic on purpose; the "you are in a chat" framing lives
// here, per session. v1 is plain text — the HTML-fragment / reply(html) contract is a
// later, additive change.
const CHAT_CONTRACT = `
You are the assistant in an interactive, single-thread chat with a user (a web chat UI:
one continuous conversation). Converse normally in plain text / markdown.

Because this is interactive, your real advantage over a one-shot run is that you can ASK.
When a request is ambiguous or underspecified — which fields to extract, which document,
how general the program should be — ask a brief, concrete clarifying question instead of
guessing. Resolve intent through dialogue first, then build.

Everything else follows your standing instructions: use the ts-networks runtime and the
knowledge base, verify with the tsn-* tools (check -> typecheck -> run), and leave a
finished program at /workspace/out/program.tsn with a short /workspace/out/recap.md.
Keep replies focused.
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

export function createSdkAgent(opts = {}) {
  const cwd = opts.cwd ?? process.env.TSN_WORKSPACE ?? '/workspace';
  const additionalDirectories = opts.additionalDirectories ?? ['/app/ts-networks', '/knowledge'];
  const append = opts.systemPromptAppend ?? CHAT_CONTRACT;
  const pathToClaudeCodeExecutable = opts.claudePath ?? resolveClaudePath();

  // Build the per-turn options. `resume` carries the conversation; on the first turn there
  // is no session yet, so we omit it and let the SDK mint one.
  function optionsFor(sessionId) {
    const options = {
      cwd,
      additionalDirectories,
      permissionMode: 'bypassPermissions',
      systemPrompt: { type: 'preset', preset: 'claude_code', append },
    };
    if (sessionId) options.resume = sessionId;
    if (pathToClaudeCodeExecutable) options.pathToClaudeCodeExecutable = pathToClaudeCodeExecutable;
    return options;
  }

  return {
    /**
     * Run one turn. Returns { text, sessionId }. `text` is the assistant's final reply;
     * `sessionId` is the (possibly new) id to pass to the next turn.
     */
    async runTurn({ prompt, sessionId }) {
      let text = '';
      let nextSessionId = sessionId;
      for await (const message of query({ prompt, options: optionsFor(sessionId) })) {
        // Every message carries the session id; capture it as soon as we see it so a
        // mid-turn failure still advances the conversation correctly.
        if (message.session_id) nextSessionId = message.session_id;
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
