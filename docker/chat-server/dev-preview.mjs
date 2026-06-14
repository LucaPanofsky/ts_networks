// Local UI preview — no Docker, no API key, no SDK. Serves the real chat UI with a fake
// agent that just echoes, so you can look at the page and the SSE flow.
//   node dev-preview.mjs   ->   http://localhost:8787
import { createServer } from './server.mjs';

const fakeAgent = {
  async runTurn({ prompt, sessionId }) {
    await new Promise((r) => setTimeout(r, 400)); // fake "thinking" so the spinner shows
    return { text: `(fake agent) you said: ${prompt}`, sessionId: sessionId ?? 'preview' };
  },
};

const port = Number(process.env.PORT ?? 8787);
createServer({ agent: fakeAgent }).listen(port, '127.0.0.1', () =>
  console.log(`UI preview (fake agent) on http://localhost:${port}`),
);
