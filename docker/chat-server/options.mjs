// The per-turn SDK options, as a PURE function — no SDK import, no I/O, no side effects.
// Kept out of agent.mjs (which imports the SDK) precisely so it can be asserted without the
// SDK installed or an API key present (see agent-options-test.mjs). agent.mjs builds its real
// options through this.
//
// The three prompt-strategy options live here and are the reason this module exists:
//
//   settingSources: ['user']  — load ONLY the baked, root-owned ~/.claude/{CLAUDE.md, skills/}.
//     The agent's cwd is /workspace, which holds USER-UPLOADED files; the SDK default (all
//     sources) would also scan the project scope, so a user-dropped /workspace/CLAUDE.md or
//     /workspace/.claude/skills/ would be loaded AS INSTRUCTIONS — a prompt-injection surface.
//     Scoping to 'user' closes it: nothing in /workspace is ever read as configuration.
//
//   skills: 'all'  — enable every discovered skill (the baked authoring-tsn-programs skill at
//     ~/.claude/skills/). Omitting this is "CLI defaults", not "skills off"; we set it
//     explicitly so the wiring is visible and stable.
//
//   systemPrompt.excludeDynamicSections: true  — keep the system prompt static and
//     cache-stable by moving the per-session dynamic sections (cwd / git / date) into the
//     first user message. The identity `append` is static text and caches fine.
export function buildTurnOptions({ sessionId, cwd, additionalDirectories, append, claudePath } = {}) {
  const options = {
    cwd,
    additionalDirectories,
    permissionMode: 'bypassPermissions',
    settingSources: ['user'],
    skills: 'all',
    systemPrompt: { type: 'preset', preset: 'claude_code', append, excludeDynamicSections: true },
  };
  // No session on the first turn — omit `resume` and let the SDK mint one.
  if (sessionId) options.resume = sessionId;
  // Let the SDK fall back to its own resolution when no path was resolved (local dev).
  if (claudePath) options.pathToClaudeCodeExecutable = claudePath;
  return options;
}
