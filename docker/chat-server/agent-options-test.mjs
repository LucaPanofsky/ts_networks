// Unit tests for the pure per-turn options builder (options.mjs).
//
// These run with NO SDK installed and NO API key: options.mjs imports nothing impure, which is
// the whole reason the builder lives there and not in agent.mjs (agent.mjs imports the SDK).
// They guard the prompt-strategy wiring — the three options that make Gavagai load his baked
// config, discover his skill, and keep a cache-stable prompt — so a regression fails loudly
// here instead of silently in a running container.
//
// Run:  node agent-options-test.mjs   (from docker/chat-server/)

import assert from 'node:assert/strict';
import { buildTurnOptions } from './options.mjs';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (err) { console.error(`FAIL: ${name}\n  ${err.message}`); process.exit(1); }
}

const base = {
  cwd: '/workspace',
  additionalDirectories: ['/app/ts-networks', '/knowledge'],
  append: 'IDENTITY',
  claudePath: '/usr/local/bin/claude',
};

// ---------- capabilities: the prompt-strategy options ----------
test('scopes settingSources to user only (loads baked ~/.claude; ignores /workspace project scope)', () => {
  assert.deepEqual(buildTurnOptions(base).settingSources, ['user']);
});

test('enables every discovered skill (the baked authoring-tsn-programs skill)', () => {
  assert.equal(buildTurnOptions(base).skills, 'all');
});

test('uses the claude_code preset with the identity append', () => {
  const sp = buildTurnOptions(base).systemPrompt;
  assert.equal(sp.type, 'preset');
  assert.equal(sp.preset, 'claude_code');
  assert.equal(sp.append, 'IDENTITY');
});

test('sets excludeDynamicSections INSIDE the preset (keeps the system prompt cache-stable)', () => {
  assert.equal(buildTurnOptions(base).systemPrompt.excludeDynamicSections, true);
});

test('passes cwd and read-only additionalDirectories through unchanged', () => {
  const o = buildTurnOptions(base);
  assert.equal(o.cwd, '/workspace');
  assert.deepEqual(o.additionalDirectories, ['/app/ts-networks', '/knowledge']);
});

test('runs with no permission prompts (the container is the sandbox)', () => {
  assert.equal(buildTurnOptions(base).permissionMode, 'bypassPermissions');
});

// ---------- invariants: session resume + executable path ----------
test('omits resume on the first turn; carries the session id once one exists', () => {
  assert.equal('resume' in buildTurnOptions(base), false, 'no resume on turn 1');
  assert.equal(buildTurnOptions({ ...base, sessionId: 'sess-1' }).resume, 'sess-1');
});

test('passes the resolved claude path through; omits it when unresolved', () => {
  assert.equal(buildTurnOptions(base).pathToClaudeCodeExecutable, '/usr/local/bin/claude');
  assert.equal('pathToClaudeCodeExecutable' in buildTurnOptions({ ...base, claudePath: undefined }), false);
});

console.log(`AGENT-OPTIONS OK — ${passed} tests (pure options builder, no SDK / no API key)`);
