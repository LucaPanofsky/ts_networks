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

// ---------- reducer + view: workspace mirror (Rungs A+B) ----------
test('initial state carries an empty workspace file map', () => {
  assert.deepEqual(initialState.files, { uploads: [], out: [] });
});

test('files-loaded replaces the workspace file map', () => {
  const files = { uploads: [{ name: 'invoice.pdf', size: 10 }], out: [{ name: 'program.tsn', size: 20 }] };
  const s = update(initialState, { type: 'files-loaded', files });
  assert.deepEqual(s.files, files);
});

test('files-loaded does not mutate its input', () => {
  const frozen = deepFreeze(structuredClone(initialState));
  const next = update(frozen, { type: 'files-loaded', files: { uploads: [{ name: 'a', size: 1 }], out: [] } });
  assert.notEqual(next, frozen);
  assert.deepEqual(frozen.files, { uploads: [], out: [] }); // original untouched
});

test('conversation-reset leaves the file list intact (files reflect disk, not the session)', () => {
  let s = update(initialState, { type: 'files-loaded', files: { uploads: [{ name: 'a', size: 1 }], out: [] } });
  s = update(s, { type: 'conversation-reset' });
  assert.deepEqual(s.files.uploads, [{ name: 'a', size: 1 }]);
});

test('sidebar shows Uploads and Outputs sections, not the old Recents stub (Rung A)', () => {
  const html = view(initialState);
  assert.ok(html.includes('Uploads'), 'Uploads section present');
  assert.ok(html.includes('Outputs'), 'Outputs section present');
  assert.ok(!html.includes('Recents'), 'Recents stub removed');
});

test('sidebar lists file names from state', () => {
  const files = { uploads: [{ name: 'invoice.pdf', size: 10 }], out: [{ name: 'program.tsn', size: 20 }] };
  const html = view(update(initialState, { type: 'files-loaded', files }));
  assert.ok(html.includes('invoice.pdf'), 'upload listed');
  assert.ok(html.includes('program.tsn'), 'output listed');
});

test('sidebar escapes file names (no injection)', () => {
  const files = { uploads: [{ name: '<img src=x>.txt', size: 1 }], out: [] };
  const html = view(update(initialState, { type: 'files-loaded', files }));
  assert.ok(!html.includes('<img src=x>.txt'), 'raw name must not appear');
  assert.ok(html.includes('&lt;img src=x&gt;.txt'), 'name must be escaped');
});

// ---------- reducer + view: upload (Rung C) ----------
test('initial state carries an idle upload status', () => {
  assert.deepEqual(initialState.upload, { busy: false, error: null });
});

test('upload-started marks busy and clears any prior error', () => {
  const s0 = update(initialState, { type: 'upload-failed', text: 'old error' });
  const s = update(s0, { type: 'upload-started' });
  assert.deepEqual(s.upload, { busy: true, error: null });
});

test('upload-succeeded clears busy (and leaves no error)', () => {
  const s = update(update(initialState, { type: 'upload-started' }), { type: 'upload-succeeded' });
  assert.deepEqual(s.upload, { busy: false, error: null });
});

test('upload-failed clears busy and records the error', () => {
  const s = update(update(initialState, { type: 'upload-started' }), { type: 'upload-failed', text: 'file too large' });
  assert.deepEqual(s.upload, { busy: false, error: 'file too large' });
});

test('upload events do not mutate their input', () => {
  const frozen = deepFreeze(structuredClone(initialState));
  const next = update(frozen, { type: 'upload-started' });
  assert.notEqual(next, frozen);
  assert.deepEqual(frozen.upload, { busy: false, error: null }); // original untouched
});

test('sidebar renders a dropzone in the Uploads section', () => {
  assert.ok(view(initialState).includes('id="dropzone"'), 'dropzone present');
});

test('view shows an uploading note while an upload is in flight', () => {
  const html = view(update(initialState, { type: 'upload-started' }));
  assert.ok(/uploading/i.test(html), 'uploading note shown while busy');
});

test('view shows and escapes an upload error', () => {
  const html = view(update(initialState, { type: 'upload-failed', text: '<b>nope</b>' }));
  assert.ok(!html.includes('<b>nope</b>'), 'raw html must not appear');
  assert.ok(html.includes('&lt;b&gt;nope&lt;/b&gt;'), 'error text must be escaped');
});

console.log(`REDUCER/VIEW OK — ${passed} tests (pure layer, ran with no DOM)`);
