# chat-server — interactive authoring chat

A single-page web chat over the ts-networks authoring agent. One **Claude Agent SDK**
session lives in-process **inside the container**; the browser talks to it over SSE + POST.
This is the interactive counterpart to the one-shot `author` mode: the agent's real
advantage here is that it can *ask* before it builds.

## Why a server inside the container

The container is the load-bearing isolation boundary — `/app/ts-networks` is root-owned and
read-only to the `node` user (OS-enforced, not agent trust). Running the chat server inside
keeps that property: the agent still uses its own `tsn-*` runtime and still cannot edit the
language source. `/workspace` (the bind mount) stays the artifact channel — finished programs
land at `/workspace/out/program.tsn` exactly as in `author` mode.

## Wire protocol

```
browser ──POST /chat {message}──▶ server        (a user turn)
browser ◀──── GET /events (SSE) ── server        (server→browser stream)
```

The server is the single source of truth; the UI is a pure projection of the SSE stream
(it renders nothing it didn't receive over `/events`). One container = one conversation.

SSE event types:

| event | payload | meaning |
|---|---|---|
| `user` | `{text}` | an accepted user turn, echoed to every client |
| `message` | `{text}` | the assistant's **complete** reply for a turn |
| `status` | `{state}` | `working` \| `idle` — a turn-level busy flag (spinner) |
| `trace` | `{text}` | live tool activity during a turn (Rung 1) — one per tool use |
| `error` | `{message}` | a turn failed |
| `reset` | `{}` | the conversation was cleared (New chat) |

## Files

**Server (Node):**
- `agent.mjs` — the **only** SDK-touching module. `createSdkAgent()` → `{ runTurn }`. Each
  turn is one `query()` resumed from the prior turn's `session_id`. Injects the interactive
  "chat contract" via `systemPrompt: { preset: 'claude_code', append }` so the always-loaded
  `agent-home/CLAUDE.md` principles still apply (the contract is per-session, not baked into
  the mode-agnostic principle file).
- `server.mjs` — bare `node:http`: SSE + POST + static page. `createServer({ agent })` takes
  an injected agent so the plumbing is testable without the SDK.

**Client (`public/`, vanilla ES modules, no build):** an event-driven, re-frame-style loop —
`raw event (SSE | DOM) → dispatch(domainEvent) → state = update(state, event) → morph(view(state))`.
- `state.js` — the single source of truth (plain data). Pure.
- `update.js` — the reducer `update(state, event) → state`. **Pure** (no DOM/IO/mutation).
- `view.js` — `view(state) → html string`. **Pure** (no DOM). HTML-escapes message text.
- `effects.js` — the `fetch` boundary (`/chat`, `/reset`).
- `main.js` — the **only** module that touches the DOM / EventSource / fetch. Holds `dispatch`,
  delegates DOM events on `document` (so they survive morphs), and morphs `#app` with idiomorph.
- `idiomorph.js` — vendored (npm `idiomorph` 0.7.4, ESM build; dependency-free, no build).
- `index.html` — a render root (`<div id="app">`) + the `main.js` module; `styles.css` — the CSS.

**Tests:**
- `smoke-test.mjs` — `node smoke-test.mjs`: drives the server with a **fake** agent (no API
  key, no claude binary) and asserts the event sequence, session resume, `/reset`, busy-guard.
- `reducer-test.mjs` — `node reducer-test.mjs`: unit tests for the pure layer (`update`/`view`).
  Runs with **no DOM** — which is the enforcement: a reducer or view that touched `document`
  would throw here. Deep-freezes inputs to prove no mutation.
- `npm test` runs both.

### Architectural constraints (keep development rational)

1. **Client stays static + zero-build, one vendored dep (idiomorph).** No framework, no bundler.
2. **`update.js` / `view.js` / `state.js` import nothing from the browser** — purity is a property
   of *which file you are in*, checked by `reducer-test.mjs` running in plain Node.
3. **`main.js` is the only impure client module** (DOM, EventSource, fetch).
4. **New features = new domain event types + view branches**, dispatched through the same loop —
   not new layers. (E.g. `reply(html)` becomes a view branch that emits raw html instead of
   escaped text; a live `trace` becomes a new event + a render region.)
5. **The UI is a pure projection of state**, which is itself a projection of the SSE stream.

## Run

In the container (`tsn-agent chat` publishes the port and prints the URL):

```bash
tsn-agent build           # if not built
tsn-agent chat            # -> http://localhost:8787
```

`PORT` (default 8787) and `TSN_CLAUDE_PATH` (default `/usr/local/bin/claude`) are set in the
image; override `TSN_AGENT_PORT` on the host to publish a different port.

**Stopping it.** `Ctrl-C` (and `docker stop`) stop the container cleanly. This requires the
`docker run --init` flag in `tsn-agent` (tini as PID 1): the server's `node` would otherwise be
PID 1, where the kernel masks default signal actions, so `SIGINT`/`SIGTERM` are ignored and the
container hangs. `server.mjs` also installs an explicit `SIGINT`/`SIGTERM` handler for a graceful
shutdown (stop accepting connections, then exit — SSE connections otherwise keep the event loop
alive). If a container is ever wedged, free the port with
`docker kill $(docker ps -q --filter publish=8787)`.

## v1 scope (and what's deferred)

**v1 (this):** architecture-correct skeleton — SDK session in-container, SSE + POST,
multi-turn resume, per-session chat contract, one **whole plain-text** message per turn.

**Shipped since v1:** a `trace` event per tool call for live progress (Rung 1) — the agent emits
one per `tool_use` as a turn runs; the UI shows it as an activity line under the spinner.

**Deferred — all additive, no rearchitecture:**
- partial `message` deltas for token-level streaming (Rung 2 — iterate the SDK's partial messages
  instead of reading only the final result);
- a `reply(html)` SDK tool + rendering replies as **HTML fragments** with hypermedia controls
  (forms as the refinement loop).

## Notes / not-yet-verified

- Sessions persist for the **container's lifetime** (the CLI's session store under
  `/home/node/.claude`). Across `docker run`s the conversation resets — fine for v1
  (one container = one chat).
- A **live** run (real `query()` against the API) is **not yet exercised** — it needs the
  API key and spends tokens (Stakeholder to trigger). The plumbing is proven by `smoke-test.mjs`;
  the SDK↔CLI interop (`pathToClaudeCodeExecutable` → global `claude`) is verified-by-construction
  against SDK `0.3.177` / CLI `2.1.177` but should be confirmed in-container on first run.
