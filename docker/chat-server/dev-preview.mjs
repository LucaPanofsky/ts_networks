// Local UI preview — no Docker, no API key, no SDK. Serves the real chat UI with a fake
// agent that just echoes, so you can look at the page and the SSE flow.
//   node dev-preview.mjs   ->   http://localhost:8787
import { createServer } from './server.mjs';

// Simulated tool activity, so the Rung 1 trace stream is visible without the real SDK (the echo
// agent makes no real tool calls). Mirrors the shape of a real authoring turn's verify loop.
const STEPS = [
  'reading the document',
  'running tsn-check',
  'running tsn-typecheck',
  'running tsn-run examples/geometry.tsn',
  'writing /workspace/out/program.tsn',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeAgent = {
  async runTurn({ prompt, sessionId, onTrace }) {
    for (const step of STEPS) {
      await sleep(550);
      onTrace?.(step); // stream the activity line, one tool at a time
    }
    await sleep(300);
    return { text: `(fake agent) you said: ${prompt}`, sessionId: sessionId ?? 'preview' };
  },
};

const port = Number(process.env.PORT ?? 8787);
createServer({ agent: fakeAgent }).listen(port, '127.0.0.1', () =>
  console.log(`UI preview (fake agent) on http://localhost:${port}`),
);
