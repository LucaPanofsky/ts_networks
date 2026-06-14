// main.js — the ONLY module that touches the DOM, EventSource, and fetch. Everything else
// (state / update / view) is pure. This file wires the event-driven loop:
//
//   raw event (SSE | DOM)  ->  dispatch(domainEvent)  ->  state = update(state, event)
//                          ->  Idiomorph.morph(#app, view(state))  ->  postRender side effects
//
// DOM listeners are DELEGATED on `document`, so they survive every morph (the rendered buttons
// are recreated, but the document-level listener is not). The textarea is preserved across
// morphs by id + ignoreActiveValue, so typing is never clobbered by an incoming server event.

import { initialState } from './state.js';
import { update } from './update.js';
import { view } from './view.js';
import { sendChat, resetConversation } from './effects.js';
import { Idiomorph } from './idiomorph.js';

let state = initialState;

function render() {
  Idiomorph.morph(document.getElementById('app'), view(state), { ignoreActiveValue: true });
  postRender();
}

function dispatch(event) {
  state = update(state, event);
  render();
}

// Side effects that must run after the DOM reflects the new state.
function postRender() {
  const thread = document.getElementById('thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
  autogrow();
}

function autogrow() {
  const input = document.getElementById('input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 240) + 'px';
}

// ---- intents (orchestrate effects, then dispatch follow-up events) ----
async function submitTurn() {
  const input = document.getElementById('input');
  const message = input.value.trim();
  if (!message || state.status === 'working') return;
  input.value = '';
  autogrow();
  dispatch({ type: 'status-changed', state: 'working' }); // optimistic; SSE confirms
  const res = await sendChat(message);
  // The user echo, assistant reply, and idle status all arrive over SSE. Here we only handle
  // the cases SSE won't tell us about: a rejected or failed POST.
  if (res.status === 409) {
    dispatch({ type: 'error-raised', text: 'A turn is already in progress — wait for the reply.' });
  } else if (!res.ok && res.status !== 204) {
    dispatch({ type: 'error-raised', text: `Send failed (${res.status}).` });
    dispatch({ type: 'status-changed', state: 'idle' });
  }
}

async function newChat() {
  const res = await resetConversation();
  if (res.ok) dispatch({ type: 'conversation-reset' }); // server also broadcasts `reset`
  document.getElementById('input')?.focus();
}

// ---- raw DOM events (delegated on document → survive morphs) ----
document.addEventListener('click', (e) => {
  if (e.target.closest('#collapse')) dispatch({ type: 'sidebar-toggled' });
  else if (e.target.closest('#newChat')) newChat();
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'composer') { e.preventDefault(); submitTurn(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'input' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTurn(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'input') autogrow(); // transient input UI; not application state
});

// ---- raw SSE events → normalized domain events ----
const es = new EventSource('/events');
es.addEventListener('user', (e) => dispatch({ type: 'user-said', text: JSON.parse(e.data).text }));
es.addEventListener('message', (e) => dispatch({ type: 'assistant-said', text: JSON.parse(e.data).text }));
es.addEventListener('error', (e) => { if (e.data) dispatch({ type: 'error-raised', text: JSON.parse(e.data).message }); });
es.addEventListener('status', (e) => dispatch({ type: 'status-changed', state: JSON.parse(e.data).state }));
es.addEventListener('reset', () => dispatch({ type: 'conversation-reset' }));

// ---- boot ----
render();
document.getElementById('input')?.focus();
