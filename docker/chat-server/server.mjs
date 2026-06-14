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
//   - trace     { text }          live tool activity during a turn (Rung 1) — one per tool use
//   - error     { message }       a turn failed
//   - reset     {}                the conversation was cleared (New chat)
//   - workspace {}                the /workspace files may have changed (Rung B) — a nudge to
//                                 refetch GET /files; sent after each turn (push the signal,
//                                 pull the data). The UI never receives file contents over SSE.
//
// Deferred (additive, no rearchitecture): partial `message` deltas for token-level streaming
// (Rung 2), and rendering replies as HTML fragments with hypermedia controls. Each turn still
// delivers one whole plain-text `message`; `trace` events are progress, not the reply.

import http from 'node:http';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, basename, resolve, sep } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// The two workspace subdirs the UI mirrors (Rung B): user uploads (writable from the UI in
// Rung C) and the agent's outputs (read-only — there is no endpoint that writes here).
const WORKSPACE_SECTIONS = ['uploads', 'out'];

// The upload size ceiling (Rung C): generous for a PDF, bounded so a client can't exhaust the
// disk. The body is read with this cap and the socket is dropped the instant it's exceeded.
const MAX_UPLOAD = 25 * 1024 * 1024; // 25 MB

/**
 * Build (but do not start) the chat HTTP server.
 * @param {object} cfg
 * @param {{ runTurn: (t:{prompt:string, sessionId?:string}) => Promise<{text:string, sessionId?:string}> }} cfg.agent
 * @param {string} [cfg.publicDir]  directory of static assets (index.html)
 * @param {string} [cfg.workspaceDir]  the bind-mounted /workspace (mirrored by GET /files)
 */
export function createServer({
  agent,
  publicDir = join(HERE, 'public'),
  workspaceDir = process.env.TSN_WORKSPACE ?? '/workspace',
}) {
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
      // A turn may have produced/changed files (the agent writes to out/). Push a signal so
      // clients refetch GET /files; the data itself is pulled, never streamed over SSE (Rung B).
      broadcast('workspace', {});
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

  // GET /files — a flat, read-only mirror of the workspace: { uploads:[{name,size}], out:[…] }.
  // One trip per section; a missing dir is simply an empty section (it may not exist until the
  // first upload / first agent output). The UI pulls this on boot and on every `workspace` nudge.
  async function handleFiles(req, res) {
    const entries = await Promise.all(WORKSPACE_SECTIONS.map((s) => listDir(join(workspaceDir, s))));
    const body = Object.fromEntries(WORKSPACE_SECTIONS.map((s, i) => [s, entries[i]]));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  // POST /upload — the ONLY client write path into the workspace, and it writes ONLY to
  // uploads/ (never out/, which is the agent's output). This is the capability axis of the
  // security model: the client can add inputs, it cannot touch the agent's artifacts. The
  // filename rides url-encoded in X-Tsn-Filename; the body is the raw file bytes (no multipart
  // — this is our own client, so the wire format is just header + body). Decoupled from a turn:
  // the file just lands in uploads/; the agent sees it on its next `ls`, and the user references
  // it in a later message. The path never rides the next chat turn.
  async function handleUpload(req, res) {
    const uploadsDir = join(workspaceDir, 'uploads');
    const name = safeUploadName(req.headers['x-tsn-filename']);
    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'a valid X-Tsn-Filename header is required' }));
      return;
    }
    // Belt-and-suspenders path-traversal guard: safeUploadName already strips directories, so
    // this should always hold — but the endpoint is the one place a client can write, so we
    // re-check that the resolved path stays inside uploads/ before touching the disk.
    const dest = confine(uploadsDir, name);
    if (!dest) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'filename escapes the uploads directory' }));
      return;
    }
    let data;
    try {
      data = await readBody(req, MAX_UPLOAD);
    } catch {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `file exceeds the ${MAX_UPLOAD}-byte limit` }));
      return;
    }
    await mkdir(uploadsDir, { recursive: true }); // may not exist until the first upload
    await writeFile(dest, data);
    broadcast('workspace', {}); // nudge every client (incl. other tabs) to refetch GET /files
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name, size: data.length }));
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
    if (req.method === 'GET' && url === '/files') return handleFiles(req, res).catch((e) => fail(res, e));
    if (req.method === 'POST' && url === '/upload') return handleUpload(req, res).catch((e) => fail(res, e));
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

// Read a request body into a Buffer, rejecting the moment it passes `limit` bytes (so an upload
// can't exhaust memory/disk). Destroys the socket on overflow rather than draining the rest.
function readBody(req, limit) {
  return new Promise((ok, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', (c) => {
      len += c.length;
      if (len > limit) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Reduce a client-supplied filename to a safe basename, or null if it isn't a usable name.
// basename() strips any directory components (so "../../etc/passwd" -> "passwd"); we then reject
// empties, the dot dirs, and stray control chars / separators. The caller still confines the
// resolved path under uploads/ as a second line of defense.
function safeUploadName(header) {
  if (typeof header !== 'string' || !header) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(header);
  } catch {
    return null; // malformed percent-encoding
  }
  const name = basename(decoded.trim());
  if (!name || name === '.' || name === '..') return null;
  if (/[\p{Cc}/\\]/u.test(name)) return null; // reject control chars and stray separators
  return name;
}

// Resolve `name` under `root` and confirm it stays inside it (path-traversal guard). Returns the
// absolute path, or null if it would escape. The `+ sep` stops a sibling like /workspace-evil.
function confine(root, name) {
  const p = resolve(root, name);
  return p === root || p.startsWith(root + sep) ? p : null;
}

// List a single workspace dir: files only (no subdirs in v1), name + size, sorted by name.
// A non-existent dir yields [] — the section just renders empty rather than erroring.
async function listDir(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // dir doesn't exist yet (e.g. nothing uploaded / no output written)
  }
  const files = [];
  for (const d of entries) {
    if (!d.isFile()) continue;
    try {
      const s = await stat(join(dir, d.name));
      files.push({ name: d.name, size: s.size });
    } catch {
      /* file vanished between readdir and stat — skip it */
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
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
