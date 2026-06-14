// The chat server: a single-page UI + one Claude Agent SDK session, bridged over HTTP.
//
// Architecture (v1 — see docker/chat-server/README.md):
//   - Browser -> server : POST /chat { message }   (user turn)
//   - Server -> browser : GET /events  (Server-Sent Events stream)
//   - One container = one conversation. The server is the single source of truth; the UI
//     is a pure projection of the SSE event stream (it renders nothing it didn't receive).
//
// SSE event types emitted (room to grow without rearchitecting the client):
//   - user    { text }            an accepted user turn (echoed to every client)
//   - message { text }            the assistant's complete reply for a turn
//   - status  { state }           "working" | "idle" — a turn-level busy flag (spinner toggle)
//   - trace   { text }            live tool activity during a turn (Rung 1) — one per tool use
//   - error   { message }         a turn failed
//   - reset   {}                  the conversation was cleared (New chat)
//
// Deferred (additive, no rearchitecture): partial `message` deltas for token-level streaming
// (Rung 2), and rendering replies as HTML fragments with hypermedia controls. Each turn still
// delivers one whole plain-text `message`; `trace` events are progress, not the reply.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Build (but do not start) the chat HTTP server.
 * @param {object} cfg
 * @param {{ runTurn: (t:{prompt:string, sessionId?:string}) => Promise<{text:string, sessionId?:string}> }} cfg.agent
 * @param {string} [cfg.publicDir]  directory of static assets (index.html)
 */
export function createServer({ agent, publicDir = join(HERE, 'public') }) {
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();
  let sessionId; // the live conversation; undefined until the first turn mints one
  let busy = false; // one turn at a time — chat is inherently sequential

  function broadcast(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  }

  function handleEvents(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n'); // reconnect backoff for the browser's EventSource
    clients.add(res);
    // Keep proxies/load-balancers from idling the stream out.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  }

  async function handleChat(req, res) {
    const body = await readJson(req);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'message is required' }));
      return;
    }
    if (busy) {
      // A turn is already running. The UI disables send while working; this guards races.
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'a turn is already in progress' }));
      return;
    }

    busy = true;
    res.writeHead(204).end(); // accept the turn; the result arrives over SSE
    broadcast('user', { text: message });
    broadcast('status', { state: 'working' });
    try {
      const result = await agent.runTurn({
        prompt: message,
        sessionId,
        onTrace: (text) => broadcast('trace', { text }), // live tool activity (Rung 1)
      });
      if (result.sessionId) sessionId = result.sessionId;
      broadcast('message', { text: result.text });
    } catch (err) {
      broadcast('error', { message: err?.message ?? String(err) });
    } finally {
      busy = false;
      broadcast('status', { state: 'idle' });
    }
  }

  function handleReset(req, res) {
    if (busy) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'a turn is in progress' }));
      return;
    }
    sessionId = undefined; // drop the conversation; the next turn mints a fresh session
    broadcast('reset', {});
    res.writeHead(204).end();
  }

  async function handleStatic(req, res) {
    // Only ever serve index.html in v1 (single page). Map "/" to it.
    const rel = req.url === '/' ? 'index.html' : normalize(req.url).replace(/^(\.\.[/\\])+/, '');
    const path = join(publicDir, rel);
    if (!path.startsWith(publicDir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': contentType(path) });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  }

  return http.createServer((req, res) => {
    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/events') return handleEvents(req, res);
    if (req.method === 'POST' && url === '/chat') return handleChat(req, res).catch((e) => fail(res, e));
    if (req.method === 'POST' && url === '/reset') return handleReset(req, res);
    if (req.method === 'GET' && url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, clients: clients.size, busy }));
    }
    if (req.method === 'GET') return handleStatic(req, res);
    res.writeHead(405).end('method not allowed');
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function fail(res, err) {
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err?.message ?? String(err) }));
  }
}

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

// ---- main entry: only here do we touch the SDK (kept out of createServer for testability) ----
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const { createSdkAgent } = await import('./agent.mjs');
  const agent = createSdkAgent();
  const server = createServer({ agent }).listen(port, '0.0.0.0', () => {
    console.log(`tsn chat server listening on http://0.0.0.0:${port}`);
  });

  // Exit cleanly on Ctrl-C / `docker stop`. The container runs with an init (tini as PID 1,
  // see docker/bin/tsn-agent) that forwards these signals; without an explicit handler a
  // process can still linger because open SSE connections keep the event loop alive. We stop
  // accepting connections, then force-exit on a short timer in case a client socket is slow
  // to drop (server.close() waits for all keep-alive connections to end).
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log(`\n${sig} received — shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000).unref();
    });
  }
}
