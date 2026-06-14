// The view: view(state) -> HTML string. PURE.
//
// Builds the entire #app subtree from state, by composition of small pure fragment functions.
// No DOM access (running this in Node would throw if it touched `document` — that is the test).
// main.js feeds the returned string to idiomorph, which morphs the live DOM to match.
//
// Text from messages is HTML-escaped here (v1: replies render as text). When the HTML-fragment
// contract lands, assistant content becomes a branch that emits raw html instead of esc(text) —
// an additive change to one fragment function, not a rearchitecture.

export function view(state) {
  return `
    <div id="app" class="app${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}">
      ${sidebar(state)}
      ${main(state)}
      ${viewer(state)}
    </div>`;
}

// The file viewer (Rung D): a right-side offcanvas + backdrop, ALWAYS in the DOM so the slide-in
// CSS transition survives idiomorph morphs (we toggle `.open`/`.show`, not presence). The body is
// loading / error / a binary note / the file's text. Content is ESCAPED here — a malicious
// uploaded file can never inject markup into the page. `data-close-viewer` marks the closers
// (the × and the backdrop), handled by the delegated click listener in main.js.
function viewer(state) {
  const v = state.viewer;
  return `
    <div class="offcanvas-backdrop${v.open ? ' show' : ''}" data-close-viewer></div>
    <aside class="offcanvas${v.open ? ' open' : ''}"${v.open ? '' : ' inert'}>
      <header class="oc-head">
        <span class="oc-title"><span class="oc-dir">${esc(v.dir ?? '')}</span>${esc(v.name ?? '')}</span>
        <button class="icon-btn" data-close-viewer aria-label="Close viewer">✕</button>
      </header>
      <div class="oc-body">${viewerBody(v)}</div>
    </aside>`;
}

function viewerBody(v) {
  if (v.loading) return `<div class="oc-note">loading…</div>`;
  if (v.error) return `<div class="oc-note error">${esc(v.error)}</div>`;
  if (v.binary) return `<div class="oc-note">Binary file (${humanSize(v.size)}) — not previewable as text.</div>`;
  const trunc = v.truncated ? `<div class="oc-note">Truncated — showing the start of ${humanSize(v.size)}.</div>` : '';
  return `${trunc}<pre class="oc-pre">${esc(v.text)}</pre>`;
}

// The sidebar mirrors the container's /workspace (Rung B): an Uploads section (what the user
// shared) and an Outputs section (what the agent wrote). There is no chat history yet, so the
// old "Recents" stub is gone — the UI no longer implies a history it doesn't have (Rung A).
function sidebar(state) {
  return `
    <aside class="sidebar">
      <div class="sidebar-head">
        <span class="brand"><span class="mark">✳</span><span class="brand-text">ts-networks</span></span>
        <button class="icon-btn" id="collapse" title="Collapse sidebar" aria-label="Collapse sidebar">⟨</button>
      </div>
      <button class="new-chat" id="newChat"><span class="plus">+</span><span class="label">New chat</span></button>
      <nav class="nav">
        ${uploadsSection(state)}
        ${fileSection('Outputs', 'out', state.files.out)}
      </nav>
      <div class="sidebar-foot"><span class="dot"></span><span class="foot-text">/workspace</span></div>
    </aside>`;
}

// The Uploads section (Rung C): the file list, plus a dropzone that uploads into
// /workspace/uploads/. Uploading is DECOUPLED from a chat turn — a dropped file just lands;
// the agent sees it on its next `ls` and the user references it in a later message. A small note
// reflects upload progress / the last error (the hidden <input> is the click-to-browse fallback).
function uploadsSection(state) {
  const { busy, error } = state.upload;
  const note = error
    ? `<div class="upload-msg error">${esc(error)}</div>`
    : busy
      ? `<div class="upload-msg">uploading…</div>`
      : '';
  const rows = state.files.uploads.length
    ? state.files.uploads.map((f) => fileRow('uploads', f)).join('')
    : `<div class="empty-note">empty</div>`;
  return `
    <h3>Uploads</h3>
    <div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="Upload a file">
      <span class="dz-hint">Drop a file or <span class="dz-link">browse</span></span>
      <input type="file" id="filePicker" class="dz-input" multiple hidden>
    </div>
    ${note}
    ${rows}`;
}

// One labelled workspace section. `dir` is the on-disk subdir (carried on each row for the
// later file-viewer rung); rows are display-only for now. Empty dirs show a quiet note.
function fileSection(label, dir, files) {
  const body = files.length
    ? files.map((f) => fileRow(dir, f)).join('')
    : `<div class="empty-note">empty</div>`;
  return `<h3>${esc(label)}</h3>${body}`;
}

function fileRow(dir, f) {
  return `<div class="file-row" data-dir="${esc(dir)}" data-name="${esc(f.name)}">
            <span class="file-name">${esc(f.name)}</span>
            <span class="file-size">${humanSize(f.size)}</span>
          </div>`;
}

function humanSize(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function main(state) {
  const empty = state.messages.length === 0;
  const working = state.status === 'working';
  return `
    <main class="main">
      <header class="topbar">
        ${rabbit('topbar-mark')}
        <span class="topbar-title">Lang Agent <span class="sep">·</span> <span class="gv">Gavagai</span></span>
        <span class="status${working ? ' working' : ''}" id="status" title="agent status"></span>
      </header>

      <div class="content${empty ? ' empty' : ''}" id="content">
        <div class="thread" id="thread">
          <div class="thread-inner" id="log">${state.messages.map(message).join('')}${activity(state)}</div>
        </div>
        ${dock(working)}
      </div>
    </main>`;
}

function message(m) {
  return `<div class="msg ${m.role}" data-id="${m.id}">${esc(m.text)}</div>`;
}

// The live activity line (Rung 1): while a turn is working, show the latest tool-activity trace
// (or a neutral "Working…" before the first trace lands). It sits at the end of the thread and
// disappears when the turn ends — the real assistant message takes its place.
function activity(state) {
  if (state.status !== 'working') return '';
  const latest = state.traces[state.traces.length - 1] || 'Working…';
  return `<div class="activity"><span class="activity-dot"></span>${esc(latest)}</div>`;
}

function dock(working) {
  return `
    <div class="dock">
      <div class="dock-inner">
        <div class="hero">
          ${rabbit('hero-mark')}
          <h1>Gavagai</h1>
          <p>Describe a document and the data you want extracted from it.</p>
        </div>
        <form class="composer" id="composer">
          <textarea id="input" rows="1" placeholder="Describe the document or extraction you want…" autofocus></textarea>
          <div class="composer-bar">
            <span class="composer-hint">Enter to send · Shift+Enter for newline</span>
            <button id="send" class="send-btn" type="submit" aria-label="Send"${working ? ' disabled' : ''}>
              <svg class="send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

// The Gavagai mark — references the <symbol id="gavagai-rabbit"> defined once in index.html.
// Sized/colored by CSS via the class (topbar-mark vs hero-mark); the body inherits currentColor
// and the question mark is themed by --q-fill.
function rabbit(cls) {
  return `<svg class="rabbit ${cls}" aria-hidden="true"><use href="#gavagai-rabbit"/></svg>`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
