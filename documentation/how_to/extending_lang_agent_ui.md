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
  ([`server.mjs`](../../docker/chat-server/server.mjs): `user` / `message` / `status` / `trace` /
  `error` / `reset` / `workspace`), produced by the agent turn in
  [`agent.mjs`](../../docker/chat-server/agent.mjs).
- **Outbound** effects — the browser calls `fetch`
  ([`effects.js`](../../docker/chat-server/public/effects.js): `/chat`, `/reset`, `/files`),
  orchestrated by `main.js`.

A note on the **`workspace` event** (Rung B): it carries *no data* — it is a pure **signal** that
the server's `/workspace` may have changed, and the client responds by **pulling** `GET /files`.
"Push the signal, pull the data" keeps file contents off the SSE stream and out of state churn;
it is the pattern to copy for any "something on disk changed" feature.

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
of just a spinner. It is **server-driven** and threads every stage. **This is now shipped as Rung 1**
— the fragments below match the code (`agent.mjs` emits a trace per `tool_use`; the UI renders an
`activity` line).

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
// a status transition resets the trace list (fresh turn on 'working', cleared on 'idle');
// same-value changes stay a no-op so they don't wipe traces mid-turn
case 'status-changed':  return state.status === event.state ? state : { ...state, status: event.state, traces: [] };
```

**5. Render it (view.js).** A pure fragment shown only while working:

```js
function activity(state) {
  if (state.status !== 'working') return '';
  const latest = state.traces[state.traces.length - 1] || 'Working…'; // neutral before the first trace
  return `<div class="activity"><span class="activity-dot"></span>${esc(latest)}</div>`;
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
- **`content` is the scroll container, not `thread`.** In a conversation the composer is a `sticky`
  child of `#content`, which is what scrolls — so the scrollbar runs full height and messages scroll
  *behind* the composer under a gradient mask (Claude-web style). Consequences a feature author must
  respect: the auto-scroll-to-bottom in `postRender()` targets `#content` (the scroller); the
  thread keeps its natural height with `margin-top: auto` so a short chat stays pinned to the bottom;
  and the composer's full-width mask spans the message column but stops at the scrollbar gutter
  (which is why it lives on `#content` and not over the `thread`). This is CSS in `styles.css` plus
  the one scroll-target line in `postRender()` — no event/reducer/view changes.
- **The UI is a pure projection of state**, which is itself a projection of the SSE stream. Never
  stash UI state in the DOM and read it back — add a state field instead.
- **Escape by default.** `view.js` HTML-escapes message text (`esc`). Emitting raw html is a
  deliberate, isolated exception (the `reply(html)` branch), never the default path.
- **The vendored `idiomorph.js` is not hand-edited.** It is the upstream ESM build with a
  provenance header; re-vendor to upgrade.
- **The Gavagai mark is one inline `<symbol>`.** The rabbit logo is defined once as
  `<symbol id="gavagai-rabbit">` in `index.html` (hidden, *outside* `#app` so morph never touches
  it) and referenced with `<use href="#gavagai-rabbit">` from a `rabbit(cls)` helper in `view.js`.
  It themes via custom-property hooks that inherit *into* the `<use>` shadow (where the symbol's
  internal `<style>` applies them — ordinary descendant selectors can't reach inside): the body
  inherits `currentColor`, the `?` is filled by `--q-fill` (defaults to `var(--accent)`) and shown
  via `--q-display`. That is how the topbar mark drops the `?` (`--q-display: none` on `.topbar-mark`)
  while the hero keeps it — one symbol, no second asset. Size/place each instance by its class
  (`topbar-mark`, `hero-mark`); don't fork the path data.
- **Run the right commands.** From `docker/chat-server/`: `npm test` (smoke + reducer/view);
  `node dev-preview.mjs` to eyeball with a fake agent; the Playwright MCP (browser `chromium`) to
  drive interactions and screenshot.

## Changelog

> **Status: under ongoing development.** The chat UI is functional and verified against a live
> built image for its core flows, but it is not yet feature-complete. The next arc (see
> `report/gavagai-ui-roadmap.md`, "Rungs 3 & 4 — REDESIGNED") makes the **left column a live mirror
> of `/workspace`**: A (drop the Recents stub) and B (the file mirror) are shipped; C (a dropzone →
> `/workspace/uploads/`) and D (a right-side plain-text file viewer) are next. Token streaming
> (the old Rung 2) was dropped — the live trace already covers perceived responsiveness.

- **Initial functional UI.** The chat client was refactored from a single inline script into the
  event-driven loop above: `state.js` / `update.js` / `view.js` / `effects.js` / `main.js`, with
  idiomorph morphing and a `reducer-test.mjs` for the pure layer. `server.mjs` exposes the
  `user` / `message` / `status` / `error` / `reset` SSE events and the `/chat` + `/reset` routes.
- **Floating composer (sticky).** The composer now floats at the bottom (Claude-web style): `#content`
  is the scroll container and the composer is a `sticky` child of it, so the scrollbar runs full
  height and messages scroll behind the composer under a gradient mask — replacing the earlier band
  layout where the scrollbar stopped at the composer. CSS-only in `styles.css` except one line in
  `postRender()` (the auto-scroll target moved from `thread` to `#content`). See the scroll-container
  gotcha above.
- **Gavagai identity.** The chat got its own mark: the rabbit-with-a-question-mark-face logo (Quine's
  gavagai) as an inline `<symbol>` in `index.html`, shown in the empty-state hero (with the title
  **Gavagai**) and small in the topbar next to **Lang Agent · Gavagai**. The body is cream
  (`currentColor`); the `?` is terracotta (`--q-fill: var(--accent)`). The sidebar stays
  `ts-networks` (the project). See the Gavagai-mark gotcha above.
- **Live trace (Rung 1).** Tool activity now streams during a turn instead of a bare spinner. The
  agent gained an `onTrace` sink (`runTurn({ …, onTrace })`); the real agent emits one per
  `tool_use`, the server broadcasts a `trace` SSE event, and the UI shows the latest as an
  `activity` line under the working indicator (cleared when the reply lands). The worked example
  above is exactly this feature. **Verified through the fake-agent preview + the smoke test; the
  real-SDK `tool_use` path is not yet exercised on the built image** (integration test deferred,
  below). Token-level streaming of the reply (the old Rung 2) was **dropped** — the trace already
  delivers perceived responsiveness, and Gavagai's real output is the program, not prose.
- **Workspace mirror (Rungs A+B).** The left column stopped pretending to hold a chat history and
  now mirrors the container's `/workspace`. **Rung A:** removed the "Recents" stub. **Rung B:** a
  read-only file list in two sections — **Uploads** (`/workspace/uploads/`) and **Outputs**
  (`/workspace/out/`, what the agent writes). Server adds `GET /files` (a flat `{uploads, out}` of
  `{name,size}`, missing dirs → empty) and broadcasts a dataless `workspace` SSE event after each
  turn; the client pulls `/files` on boot, after a reset, and on every `workspace` nudge
  (push-signal/pull-data). New state field `files`, reducer case `files-loaded`, a `sidebar(state)`
  file-list view, and `effects.fetchFiles`. `conversation-reset` deliberately leaves `files` intact
  (the workspace persists across New chat). Verified via the fake-agent preview (Playwright: the
  Outputs section fills in live after a turn) + the smoke test (`GET /files` shape, the `workspace`
  event in the per-turn sequence).
- **Upload dropzone (Rung C).** The Uploads section now takes a drop or a file picker and uploads
  into `/workspace/uploads/`, **decoupled from the turn** — the file just lands; the agent sees it
  on its next `ls` and the user references it in a later message (the path never rides the chat
  message). Server adds `POST /upload`: the **only** client write path, and it writes **only** to
  `uploads/`. Filename rides url-encoded in `X-Tsn-Filename`, body is the raw bytes (no multipart —
  our own client); the server basenames the name + re-confines the resolved path under `uploads/`
  (path-traversal guard), caps the size (25 MB → `413`), writes, then nudges `workspace`. New state
  field `upload {busy,error}`, reducer cases `upload-started|succeeded|failed`, an `uploadsSection`
  view with the dropzone, `effects.uploadFile`, and `main.js` picker + drag/drop wiring (the drag
  *highlight* is transient browser-only UI, toggled directly like autogrow — it never goes through
  the reducer). The per-session **chat contract** (`agent.mjs`) now tells the agent to treat
  `uploads/` as read-only input. Verified via the fake-agent preview (Playwright: a picked file
  appears in Uploads, lands in `uploads/` on disk, `out/` untouched) + the smoke test (`POST /upload`
  round-trip, traversal name confined to its basename, empty filename → `400`).
- **File viewer (Rung D).** Clicking a workspace file opens a **right-side offcanvas** that reads it
  via `GET /files/<dir>/<name>` and renders it as **escaped plain text** in a `<pre>`. This is the
  rung that puts a **read** path behind the same `confine()` traversal guard the upload write uses:
  `dir` must be a known section, the name is one url-encoded segment, the resolved path is confined
  under `<dir>/` (`../` → `403`, unknown section / missing → `404`). The endpoint returns JSON
  `{dir,name,size,truncated,binary,text}`; a **binary** file (NUL byte) reports `binary:true` and a
  "not previewable" note instead of mojibake, and a file over 256 KB is read up to the cap and shown
  `truncated`. New state field `viewer`, reducer cases `viewer-opened|loaded|failed|closed`, a
  `viewer` view branch (offcanvas + backdrop **always in the DOM** so the slide-in transition
  survives morphs — `.open`/`.show` toggled from state, `inert` while closed so there's no off-screen
  tab stop), `effects.fetchFileContent`, and `main.js` row-click + close (×/backdrop/`Esc`). File
  content is escaped at render, so a malicious upload can't inject markup. Verified via the
  fake-agent preview (Playwright: open shows the text, `Esc` closes, `inert` blocks focus on the
  closed panel) + the smoke test (read round-trip for `uploads/` and `out/`, traversal → `403`,
  unknown section / missing → `404`, NUL-byte file → `binary:true`). PDF/kind-aware preview is
  **deferred** — the viewer shows text; rendering a PDF needs a viewer lib + a raw-bytes route, a
  later layer on top (see `report/gavagai-ui-roadmap.md`, decision 6).
- **Integration testing (live image).** Verified end-to-end against the built container.

  Verified:
  - [x] **Multi-turn session resume** — a later turn recalls earlier ones.
  - [x] **`New chat` resets the server-side session** — a fresh session, no leakage of prior turns.
  - [x] **Workspace round-trip, both directions** — host↔container file exchange (the foundation for UI file upload).
  - [x] **The `tsn-*` verify loop runs in-turn** — `check → typecheck → run` against the read-only runtime.

  Deferred:
  - [ ] **Busy-guard / no double-send** — send disabled while a turn is in flight.
  - [ ] **Multi-tab + SSE reconnect** — multiple tabs share the conversation; the stream auto-reconnects.
  - [ ] **Live trace on the real image (Rung 1)** — confirm the real SDK's `tool_use` blocks surface
    as `activity` lines in the built container (the fake-agent pipeline is already verified).
  - [ ] **Upload on the real image (Rung C)** — confirm `POST /upload` writes into the container's
    `/workspace/uploads/` and the agent reads the file from there (the fake-agent path is verified).
  - [ ] **Viewer on the real image (Rung D)** — confirm `GET /files/<dir>/<name>` reads a real
    `out/program.tsn` the agent wrote, and binary uploads show the note (fake-agent path verified).
  - [ ] **Program authoring** — generating a new `.tsn` extractor end-to-end (its own later pass).
