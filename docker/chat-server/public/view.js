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
      ${sidebar()}
      ${main(state)}
    </div>`;
}

function sidebar() {
  return `
    <aside class="sidebar">
      <div class="sidebar-head">
        <span class="brand"><span class="mark">✳</span><span class="brand-text">ts-networks</span></span>
        <button class="icon-btn" id="collapse" title="Collapse sidebar" aria-label="Collapse sidebar">⟨</button>
      </div>
      <button class="new-chat" id="newChat"><span class="plus">+</span><span class="label">New chat</span></button>
      <nav class="nav">
        <h3>Recents</h3>
        <div class="empty-note" id="recents">No conversations yet</div>
      </nav>
      <div class="sidebar-foot"><span class="dot"></span><span class="foot-text">/workspace</span></div>
    </aside>`;
}

function main(state) {
  const empty = state.messages.length === 0;
  const working = state.status === 'working';
  return `
    <main class="main">
      <header class="topbar">
        <span class="topbar-title">TSN Lang Agent | Gavagai</span>
        <span class="status${working ? ' working' : ''}" id="status" title="agent status"></span>
      </header>

      <div class="content${empty ? ' empty' : ''}" id="content">
        <div class="thread" id="thread">
          <div class="thread-inner" id="log">${state.messages.map(message).join('')}</div>
        </div>
        ${dock(working)}
      </div>
    </main>`;
}

function message(m) {
  return `<div class="msg ${m.role}" data-id="${m.id}">${esc(m.text)}</div>`;
}

function dock(working) {
  return `
    <div class="dock">
      <div class="dock-inner">
        <div class="hero">
          <h1><span class="mark">✳</span> ts-networks</h1>
          <p>Describe a document and the data you want extracted from it.</p>
        </div>
        <form class="composer" id="composer">
          <textarea id="input" rows="1" placeholder="Describe the document or extraction you want…" autofocus></textarea>
          <div class="composer-bar">
            <span class="composer-hint">Enter to send · Shift+Enter for newline</span>
            <button id="send" class="send-btn" type="submit" aria-label="Send"${working ? ' disabled' : ''}>↑</button>
          </div>
        </form>
      </div>
    </div>`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
