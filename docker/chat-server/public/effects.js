// Effects: the network I/O boundary. The only place (besides main.js) that performs side
// effects. Thin wrappers over fetch — they return the raw Response; main.js decides what
// events to dispatch from the outcome. Conversation results come back asynchronously over the
// SSE stream, not from these calls' return values.

export function sendChat(message) {
  return fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export function resetConversation() {
  return fetch('/reset', { method: 'POST' });
}

// The workspace mirror (Rung B). Returns the raw Response; main.js parses + dispatches.
export function fetchFiles() {
  return fetch('/files');
}
