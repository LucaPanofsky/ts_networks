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

// Upload one file into /workspace/uploads/ (Rung C). No multipart: the filename rides url-encoded
// in a header and the body is the raw File (fetch streams it). The server is the only writer and
// only ever writes uploads/. Returns the raw Response; main.js decides the follow-up events.
export function uploadFile(file) {
  return fetch('/upload', {
    method: 'POST',
    headers: { 'X-Tsn-Filename': encodeURIComponent(file.name) },
    body: file,
  });
}

// Read one workspace file's content for the viewer (Rung D). The name is a single path segment,
// url-encoded; the server confines it under <dir>/. Returns the raw Response; main.js parses it.
export function fetchFileContent(dir, name) {
  return fetch(`/files/${encodeURIComponent(dir)}/${encodeURIComponent(name)}`);
}
