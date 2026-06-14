// The reducer: update(state, event) -> state. PURE.
//
// No DOM, no I/O, no mutation — always returns a new state (or the same reference when nothing
// changes). Events are domain-level and normalized by main.js from raw SSE / DOM events, so
// this file never knows about EventSource, fetch, or the browser. That is what makes it
// testable in plain Node (reducer-test.mjs) and is the enforcement point for "pure handlers".
//
// Events:
//   { type: 'user-said',          text }
//   { type: 'assistant-said',     text }
//   { type: 'error-raised',       text }
//   { type: 'status-changed',     state: 'working'|'idle' }
//   { type: 'trace-appended',     text }
//   { type: 'files-loaded',       files }   // { uploads:[{name,size}], out:[…] } — the workspace mirror
//   { type: 'upload-started' }              // a dropzone upload is in flight (Rung C)
//   { type: 'upload-succeeded' }            // it landed; main.js refetches the file list
//   { type: 'upload-failed',      text }    // it was rejected/failed; show the reason
//   { type: 'conversation-reset' }
//   { type: 'sidebar-toggled' }

export function update(state, event) {
  switch (event.type) {
    case 'user-said':
      return addMessage(state, 'user', event.text);
    case 'assistant-said':
      return addMessage(state, 'assistant', event.text);
    case 'error-raised':
      return addMessage(state, 'error', event.text);
    case 'status-changed':
      // A status transition also resets the trace list: entering 'working' starts a fresh turn,
      // leaving it clears the just-finished turn's activity. Same-value changes are a no-op.
      return state.status === event.state ? state : { ...state, status: event.state, traces: [] };
    case 'trace-appended':
      return { ...state, traces: [...state.traces, event.text] };
    case 'files-loaded':
      // The workspace mirror (Rung B). Wholesale replace — GET /files is the source of truth.
      return { ...state, files: event.files };
    case 'upload-started':
      // A dropzone upload began (Rung C): mark busy and clear any stale error.
      return { ...state, upload: { busy: true, error: null } };
    case 'upload-succeeded':
      return { ...state, upload: { busy: false, error: null } };
    case 'upload-failed':
      return { ...state, upload: { busy: false, error: event.text } };
    case 'conversation-reset':
      // New chat clears the SESSION, not the workspace: uploads/outputs live on disk and persist.
      // So `files` is deliberately left intact here (main.js refetches after the reset anyway).
      return { ...state, messages: [], status: 'idle', traces: [] };
    case 'sidebar-toggled':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    default:
      return state; // unknown event: identity (no-op)
  }
}

function addMessage(state, role, text) {
  const seq = state.seq + 1;
  return { ...state, seq, messages: [...state.messages, { id: seq, role, text }] };
}
