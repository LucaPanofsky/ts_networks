// Plumbing smoke test for the chat server — runs WITHOUT the SDK or an API key.
//
// It injects a fake agent (so createServer never touches the SDK), connects to the SSE
// stream over raw http, POSTs a turn, and asserts the event sequence the UI relies on:
//   user -> status(working) -> message -> status(idle)
// plus session continuity (the fake echoes the resumed session id back into its reply).
//
// Run:  node smoke-test.mjs   (from docker/chat-server/)

import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server.mjs';

// A throwaway workspace so GET /files (Rung B) has real dirs to mirror: one upload, one output.
const workspaceDir = mkdtempSync(join(tmpdir(), 'tsn-ws-'));
mkdirSync(join(workspaceDir, 'uploads'), { recursive: true });
mkdirSync(join(workspaceDir, 'out'), { recursive: true });
writeFileSync(join(workspaceDir, 'uploads', 'note.txt'), 'hello');
writeFileSync(join(workspaceDir, 'out', 'program.tsn'), '(network demo)');

// A fake agent: echoes the prompt and advances a fake session id each turn. It also emits one
// trace per turn via the onTrace sink, so the smoke test exercises the live-trace plumbing.
let turns = 0;
const fakeAgent = {
  async runTurn({ prompt, sessionId, onTrace }) {
    turns += 1;
    onTrace?.('thinking');
    return { text: `echo[${prompt}] (resumed=${sessionId ?? 'none'})`, sessionId: `sess-${turns}` };
  },
};

const server = createServer({ agent: fakeAgent, workspaceDir });

function get(path) {
  return new Promise((resolve) => http.get({ port, path }, resolve));
}
function post(path, obj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(obj);
    const req = http.request(
      { port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); res.on('end', () => resolve(res)); },
    );
    req.on('error', reject);
    req.end(body);
  });
}
const postChat = (message) => post('/chat', { message });

// Collect SSE events from a long-lived response, resolving once we've seen `count` of them.
function collectEvents(res, count) {
  return new Promise((resolve) => {
    const events = [];
    let buf = '';
    res.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /event: (.+)/.exec(frame)?.[1];
        const data = /data: (.+)/.exec(frame)?.[1];
        if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
        if (events.length >= count) resolve(events);
      }
    });
  });
}

let port;
server.listen(0, '127.0.0.1', async () => {
  port = server.address().port;
  try {
    // healthz
    const health = await new Promise((r) => get('/healthz').then((res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => r(JSON.parse(b)));
    }));
    assert.equal(health.ok, true, 'healthz ok');

    // index page served
    const indexRes = await get('/');
    assert.equal(indexRes.statusCode, 200, '/ serves index.html');

    // GET /files mirrors the workspace (Rung B): uploads/ and out/, flat, files only
    const filesRes = await new Promise((r) => get('/files').then((res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => r({ status: res.statusCode, body: JSON.parse(b) }));
    }));
    assert.equal(filesRes.status, 200, 'GET /files ok');
    assert.deepEqual(filesRes.body.uploads.map((f) => f.name), ['note.txt'], 'lists uploads/');
    assert.deepEqual(filesRes.body.out.map((f) => f.name), ['program.tsn'], 'lists out/');

    // open SSE, drive two turns, assert the event sequence
    const sse = await get('/events');
    const want = 12; // (user, status, trace, message, status, workspace) x2
    const eventsP = collectEvents(sse, want);

    const r1 = await postChat('first');
    assert.equal(r1.statusCode, 204, 'POST /chat accepted');
    // second turn after a tick so it doesn't 409 against the first
    await new Promise((r) => setTimeout(r, 50));
    await postChat('second');

    const events = await eventsP;
    const seq = events.map((e) => `${e.event}:${e.data.state ?? ''}`);
    assert.deepEqual(
      seq,
      ['user:', 'status:working', 'trace:', 'message:', 'status:idle', 'workspace:',
       'user:', 'status:working', 'trace:', 'message:', 'status:idle', 'workspace:'],
      'event sequence for two turns (trace before message; workspace nudge after the turn)',
    );
    // session continuity: second turn resumed the first turn's minted id
    const secondReply = events.filter((e) => e.event === 'message')[1].data.text;
    assert.match(secondReply, /resumed=sess-1/, 'second turn resumes first session id');

    // New chat: /reset clears the server session and broadcasts `reset`; the next turn
    // resumes nothing (fresh session).
    const resetEvP = collectEvents(sse, 1);
    const rs = await post('/reset', {});
    assert.equal(rs.statusCode, 204, 'POST /reset accepted');
    assert.equal((await resetEvP)[0].event, 'reset', 'reset broadcast to clients');
    const afterReset = collectEvents(sse, 4); // user, status(working), trace, message
    await postChat('again');
    const freshReply = (await afterReset).find((e) => e.event === 'message').data.text;
    assert.match(freshReply, /resumed=none/, 'turn after reset starts a fresh session');

    // busy guard: an overlapping POST while a (slow) turn runs gets 409
    fakeAgent.runTurn = ({ sessionId }) => new Promise((res) => setTimeout(() => res({ text: 'slow', sessionId }), 200));
    postChat('slow-1');
    await new Promise((r) => setTimeout(r, 20));
    const overlap = await postChat('slow-2');
    assert.equal(overlap.statusCode, 409, 'overlapping turn rejected with 409');

    console.log('SMOKE OK — plumbing verified: event sequence, session resume, /reset (new chat), busy-guard 409');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('SMOKE FAILED:', err.message);
    server.close();
    process.exit(1);
  }
});
