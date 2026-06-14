// Unit tests for the pure layer: update() (reducer) and view() (render).
//
// These run in plain Node with NO DOM. That is itself the enforcement of "pure functions":
// if a reducer or the view ever reached for `document`/`window`, this file would throw
// ReferenceError instead of passing. We also deep-freeze inputs to prove no mutation.
//
// Run:  node reducer-test.mjs   (from docker/chat-server/)

import assert from 'node:assert/strict';
import { initialState } from './public/state.js';
import { update } from './public/update.js';
import { view, esc } from './public/view.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (err) { console.error(`FAIL: ${name}\n  ${err.message}`); process.exit(1); }
}

function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

// ---------- reducer: capabilities ----------
test('user-said appends a user message', () => {
  const s = update(initialState, { type: 'user-said', text: 'hi' });
  assert.deepEqual(s.messages, [{ id: 1, role: 'user', text: 'hi' }]);
});

test('assistant-said and error-raised append with the right role', () => {
  let s = update(initialState, { type: 'assistant-said', text: 'a' });
  s = update(s, { type: 'error-raised', text: 'boom' });
  assert.deepEqual(s.messages.map((m) => m.role), ['assistant', 'error']);
});

test('status-changed sets status', () => {
  assert.equal(update(initialState, { type: 'status-changed', state: 'working' }).status, 'working');
});

test('conversation-reset clears messages and returns to idle', () => {
  let s = update(initialState, { type: 'user-said', text: 'x' });
  s = update(s, { type: 'status-changed', state: 'working' });
  s = update(s, { type: 'conversation-reset' });
  assert.deepEqual(s.messages, []);
  assert.equal(s.status, 'idle');
});

test('sidebar-toggled flips the flag', () => {
  const s = update(initialState, { type: 'sidebar-toggled' });
  assert.equal(s.sidebarCollapsed, true);
  assert.equal(update(s, { type: 'sidebar-toggled' }).sidebarCollapsed, false);
});

// ---------- reducer: invariants ----------
test('message ids are unique and monotonic across appends', () => {
  let s = initialState;
  for (const t of ['a', 'b', 'c']) s = update(s, { type: 'user-said', text: t });
  const ids = s.messages.map((m) => m.id);
  assert.deepEqual(ids, [1, 2, 3]);
  assert.equal(new Set(ids).size, ids.length);
});

test('ids keep climbing even after a reset (no collisions with old DOM nodes)', () => {
  let s = update(initialState, { type: 'user-said', text: 'a' }); // id 1
  s = update(s, { type: 'conversation-reset' });
  s = update(s, { type: 'user-said', text: 'b' }); // id 2, not 1
  assert.equal(s.messages[0].id, 2);
});

test('reducer never mutates its input (deep-frozen state)', () => {
  const frozen = deepFreeze(structuredClone(initialState));
  const next = update(frozen, { type: 'user-said', text: 'hi' }); // would throw if it mutated
  assert.notEqual(next, frozen);
  assert.deepEqual(frozen.messages, []); // original untouched
});

test('unknown event is identity (same reference)', () => {
  assert.equal(update(initialState, { type: 'nope' }), initialState);
});

test('status-changed to the same value is a no-op (same reference)', () => {
  assert.equal(update(initialState, { type: 'status-changed', state: 'idle' }), initialState);
});

// ---------- view: purity + escaping (negative) ----------
test('view is a pure deterministic string', () => {
  const s = update(initialState, { type: 'user-said', text: 'hello' });
  assert.equal(typeof view(s), 'string');
  assert.equal(view(s), view(s)); // same input -> same output
});

test('view HTML-escapes message text (no injection)', () => {
  const s = update(initialState, { type: 'assistant-said', text: '<script>alert(1)</script>' });
  const html = view(s);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script must not appear');
  assert.ok(html.includes('&lt;script&gt;'), 'text must be escaped');
});

test('esc covers all five HTML-significant chars', () => {
  assert.equal(esc(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

// ---------- view: reflects state ----------
test('empty state renders the empty-content modifier; non-empty does not', () => {
  assert.ok(view(initialState).includes('content empty'));
  const s = update(initialState, { type: 'user-said', text: 'x' });
  assert.ok(!view(s).includes('content empty'));
  assert.ok(view(s).includes('>x</div>'));
});

test('working status renders the spinner class and disables send', () => {
  const s = update(initialState, { type: 'status-changed', state: 'working' });
  const html = view(s);
  assert.ok(html.includes('status working'));
  assert.ok(/id="send"[^>]*disabled/.test(html));
});

test('sidebarCollapsed renders the collapsed modifier on the root', () => {
  const s = update(initialState, { type: 'sidebar-toggled' });
  assert.ok(view(s).includes('app sidebar-collapsed'));
});

// ---------- reducer: live trace (Rung 1) ----------
test('trace-appended accumulates traces in order', () => {
  let s = update(initialState, { type: 'trace-appended', text: 'reading the document' });
  s = update(s, { type: 'trace-appended', text: 'running tsn-check' });
  assert.deepEqual(s.traces, ['reading the document', 'running tsn-check']);
});

test('status-changed to working starts a fresh trace list; to idle clears it', () => {
  let s = update(initialState, { type: 'status-changed', state: 'working' });
  s = update(s, { type: 'trace-appended', text: 'x' });
  assert.deepEqual(s.traces, ['x']);
  s = update(s, { type: 'status-changed', state: 'idle' });
  assert.deepEqual(s.traces, [], 'traces cleared when the turn ends');
});

test('a new working turn does not inherit the previous turn’s traces', () => {
  let s = update(initialState, { type: 'status-changed', state: 'working' });
  s = update(s, { type: 'trace-appended', text: 'old' });
  s = update(s, { type: 'status-changed', state: 'idle' });
  s = update(s, { type: 'status-changed', state: 'working' });
  assert.deepEqual(s.traces, []);
});

test('conversation-reset clears traces too', () => {
  let s = update(initialState, { type: 'status-changed', state: 'working' });
  s = update(s, { type: 'trace-appended', text: 'x' });
  s = update(s, { type: 'conversation-reset' });
  assert.deepEqual(s.traces, []);
});

// ---------- view: the activity line ----------
test('view shows the latest trace as an activity line only while working', () => {
  let s = update(initialState, { type: 'status-changed', state: 'working' });
  s = update(s, { type: 'trace-appended', text: 'reading the document' });
  s = update(s, { type: 'trace-appended', text: 'running tsn-typecheck' });
  const html = view(s);
  assert.ok(html.includes('class="activity"'), 'activity line shown while working');
  assert.ok(html.includes('running tsn-typecheck'), 'shows the LATEST trace');
  assert.ok(!html.includes('reading the document'), 'only the latest, not the whole history');
  const idle = update(s, { type: 'status-changed', state: 'idle' });
  assert.ok(!view(idle).includes('class="activity"'), 'no activity line once idle');
});

test('activity line escapes trace text (no injection)', () => {
  let s = update(initialState, { type: 'status-changed', state: 'working' });
  s = update(s, { type: 'trace-appended', text: '<b>x</b>' });
  const html = view(s);
  assert.ok(!html.includes('<b>x</b>'), 'raw html must not appear');
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'), 'trace text must be escaped');
});

console.log(`REDUCER/VIEW OK — ${passed} tests (pure layer, ran with no DOM)`);
