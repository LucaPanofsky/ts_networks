// The single source of truth (the "app db"). Plain data only — no DOM, no functions.
//
// Everything the UI shows is derived from this object by view(state). Transient browser-only
// input (the textarea's value, cursor, IME composition) is deliberately NOT here: it is read
// at the effect boundary on submit. That keeps keystrokes from churning the render loop and
// avoids the cursor/morph hazards of a "controlled" textarea.

export const initialState = {
  messages: [],          // [{ id:number, role:'user'|'assistant'|'error', text:string }]
  status: 'idle',        // 'idle' | 'working'
  traces: [],            // live tool activity for the current turn; reset each turn (Rung 1)
  sidebarCollapsed: false,
  seq: 0,                // monotonic counter → stable message ids (kept in state so ids stay pure)
};
