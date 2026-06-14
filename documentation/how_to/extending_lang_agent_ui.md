# How to: extend the language agent UI

This document is the recipe for adding a feature to **Gavagai**, the language agent's chat UI
(see [the language agent overview](../lang_agent.md)). It is written to be followed by either a
human or an LLM: read it, then thread the feature through the architecture stage by stage.

The client is **vanilla JS, no build step, one vendored dependency** (idiomorph). It is
deliberately event-driven and functional — that is what lets it scale and refactor cleanly. All
files live under [`docker/chat-server/`](../../docker/chat-server).

---

## General principle

The UI is a **unidirectional loop** (the re-frame shape). A raw event flows through fixed stages,
and each stage has exactly one home file:

```
raw event  (SSE message | DOM event)
   │  adapter → dispatch        docker/chat-server/public/main.js     (the only impure module)
   ▼
domain event  { type, … }
   │  reducer (PURE)            docker/chat-server/public/update.js
   ▼
new state                      docker/chat-server/public/state.js     (the single source of truth)
   │  view (PURE)               docker/chat-server/public/view.js      (state → html string)
   ▼
html string
   │  morph                     docker/chat-server/public/idiomorph.js (called from main.js)
   ▼
live DOM
```

Side effects sit at the **edges**, never in the middle:

- **Inbound** effects — the server pushes events over SSE
  ([`server.mjs`](../../docker/chat-server/server.mjs): `user` / `message` / `status` / `error` /
  `reset`), produced by the agent turn in [`agent.mjs`](../../docker/chat-server/agent.mjs).
- **Outbound** effects — the browser calls `fetch`
  ([`effects.js`](../../docker/chat-server/public/effects.js): `/chat`, `/reset`), orchestrated by
  `main.js`.

**The middle is pure.** `state.js` / `update.js` / `view.js` import nothing from the browser. That
is not a style preference — it is the property that makes the loop testable and is enforced
mechanically (see below).

Two project rules govern the whole process:

- **The pure layer stays pure, and is tested in plain Node.**
  [`reducer-test.mjs`](../../docker/chat-server/reducer-test.mjs) runs `update`/`view` with **no
  DOM** — a reducer or view that reached for `document` would throw `ReferenceError` instead of
  passing. It also deep-freezes inputs to prove no mutation. Follow the test methodology in
  `CLAUDE.md` (capabilities / invariants / negatives / units).
- **The suite and the preview stay green.** From `docker/chat-server/`: `npm test` (runs the
  server smoke test + the reducer/view tests); `node dev-preview.mjs` to eyeball the page with a
  fake agent (no API key needed).

---

## The stages, as a checklist

You rarely need every stage — how far you go depends on what the feature *is*. A purely visual
tweak driven by state you already have stops at the view (stage 5). A new server-driven signal
threads the whole loop.

1. **Decide the event.** Is the feature driven by the **server** (something the agent/turn
   produces → a new SSE event) or by the **user** (a DOM interaction)? Name the *domain* event it
   becomes, e.g. `{ type: 'trace-appended', text }`.
2. **(server-driven only) Emit the SSE event.** Add it in `server.mjs` (and produce it in
   `agent.mjs` if it comes from the agent's turn). Document the new event in the README's event
   table.
3. **Adapt it to a domain event** in `main.js` — either an `es.addEventListener('<sse>', …)` line
   or a delegated DOM listener — and `dispatch` it. `main.js` is the **only** place that knows
   about EventSource, the DOM, or fetch.
4. **Reduce it.** Handle the new event in `update.js` (pure), and add any new field to the state
   shape in `state.js`. Return a new state; never mutate.
5. **Render it.** Add a branch/fragment to `view.js` (pure) that derives the new UI from state.
6. **(effectful features only)** Add the `fetch` wrapper to `effects.js` and orchestrate it in
   `main.js` (perform the effect, then `dispatch` follow-up events from the outcome).
7. **Test.** Add reducer/view cases to `reducer-test.mjs`; if you added a server route or SSE
   event, extend `smoke-test.mjs` (it drives the server with a fake agent).

Verify continuously: `npm test`, and `node dev-preview.mjs` to see it.

---

## A worked example: a live `trace` line

Goal: while a turn runs, show the agent's tool activity (e.g. "running `tsn-typecheck`…") instead
of just a spinner. It is **server-driven** and threads every stage. Illustrative fragments, not
the full code.

**1. The event.** A new SSE event `trace { text }`, which becomes the domain event
`{ type: 'trace-appended', text }`.

**2. Emit it (server).** In `agent.mjs`, iterate the SDK messages instead of reading only the
final `result`, and call a sink for each tool use; in `server.mjs`, broadcast it:

```js
// agent.mjs — inside the for-await over query() messages
if (message.type === 'assistant') for (const b of message.message.content)
  if (b.type === 'tool_use') onTrace?.(`${b.name}…`);

// server.mjs — broadcast('trace', { text }) from the onTrace sink
```

**3. Adapt it (main.js).** One line next to the other SSE adapters:

```js
es.addEventListener('trace', (e) => dispatch({ type: 'trace-appended', text: JSON.parse(e.data).text }));
```

**4. Reduce it (update.js + state.js).** Add `traces: []` to `initialState`, then a pure case —
and clear it when a turn ends or resets:

```js
case 'trace-appended':  return { ...state, traces: [...state.traces, event.text] };
case 'status-changed':  return { ...state, status: event.state, traces: event.state === 'working' ? state.traces : [] };
```

**5. Render it (view.js).** A pure fragment shown only while working:

```js
function traceLine(state) {
  if (state.status !== 'working' || state.traces.length === 0) return '';
  return `<div class="trace">${esc(state.traces[state.traces.length - 1])}</div>`;
}
```

**6. Effects.** None — `trace` is inbound only.

**7. Test.** In `reducer-test.mjs`: `trace-appended` appends; `status-changed → idle` clears
`traces`; `view` renders the latest trace only while working and escapes it. No DOM needed.

That is the whole feature. Note what it did **not** require: no new module, no framework, no
change to the morph or the loop — a new event type and a view branch, dispatched through the same
pipeline. The deferred **`reply(html)`** feature is even smaller: it is a single `view.js` branch
that emits the agent's raw html instead of `esc(text)` for assistant messages.

---

## Conventions and gotchas

- **The purity boundary is the architecture.** `update.js` / `view.js` / `state.js` must import
  nothing from the browser; `main.js` is the **only** impure client module (DOM, EventSource,
  fetch). Running `reducer-test.mjs` in Node is the enforcement — keep the pure files importable
  there.
- **Keep reducers deterministic.** No `Date.now()`, no `Math.random()` inside `update.js`. Stable
  message ids come from the `seq` counter **in state** (`addMessage` derives `id = seq + 1`), so
  ids stay pure and survive a reset without colliding with old DOM nodes.
- **Transient input is not application state.** The textarea's value / cursor / IME is read at the
  submit boundary in `main.js`, deliberately *not* held in state — this avoids per-keystroke
  re-renders and the cursor hazards of a "controlled" textarea. Don't move it into state.
- **DOM listeners are delegated on `document`.** The view is re-rendered on every morph, so
  listeners bound to rendered elements would be lost. Bind on `document` and match by id
  (`e.target.closest('#collapse')`, `e.target.id === 'input'`) so they survive morphs.
- **idiomorph specifics.** `main.js` morphs `#app` (outerHTML, so the `app`/`sidebar-collapsed`
  class is rendered from state too). `ignoreActiveValue: true` protects the focused textarea from
  being clobbered by an incoming server event. Anything the DOM owns but state doesn't (scroll
  position, the textarea auto-grow height) is re-applied in `postRender()` after each morph.
- **The UI is a pure projection of state**, which is itself a projection of the SSE stream. Never
  stash UI state in the DOM and read it back — add a state field instead.
- **Escape by default.** `view.js` HTML-escapes message text (`esc`). Emitting raw html is a
  deliberate, isolated exception (the `reply(html)` branch), never the default path.
- **The vendored `idiomorph.js` is not hand-edited.** It is the upstream ESM build with a
  provenance header; re-vendor to upgrade.
- **Run the right commands.** From `docker/chat-server/`: `npm test` (smoke + reducer/view);
  `node dev-preview.mjs` to eyeball with a fake agent; the Playwright MCP (browser `chromium`) to
  drive interactions and screenshot.

## Changelog

> **Status: under ongoing development.** The chat UI is functional and verified against a live
> built image for its core flows, but it is not yet feature-complete — expect refinements
> (e.g. a chat-contract tweak and file upload from the UI are planned next).

- **Initial functional UI.** The chat client was refactored from a single inline script into the
  event-driven loop above: `state.js` / `update.js` / `view.js` / `effects.js` / `main.js`, with
  idiomorph morphing and a `reducer-test.mjs` for the pure layer. `server.mjs` exposes the
  `user` / `message` / `status` / `error` / `reset` SSE events and the `/chat` + `/reset` routes.
- **Integration testing (live image).** Verified end-to-end against the built container.

  Verified:
  - [x] **Multi-turn session resume** — a later turn recalls earlier ones.
  - [x] **`New chat` resets the server-side session** — a fresh session, no leakage of prior turns.
  - [x] **Workspace round-trip, both directions** — host↔container file exchange (the foundation for UI file upload).
  - [x] **The `tsn-*` verify loop runs in-turn** — `check → typecheck → run` against the read-only runtime.

  Deferred:
  - [ ] **Busy-guard / no double-send** — send disabled while a turn is in flight.
  - [ ] **Multi-tab + SSE reconnect** — multiple tabs share the conversation; the stream auto-reconnects.
  - [ ] **Program authoring** — generating a new `.tsn` extractor end-to-end (its own later pass).
