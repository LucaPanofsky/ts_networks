// Local UI preview — no Docker, no API key, no SDK. Serves the real chat UI with a fake
// agent that just echoes, so you can look at the page and the SSE flow.
//   node dev-preview.mjs   ->   http://localhost:8787
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server.mjs';

// A throwaway workspace so the sidebar mirror (Rung B) has something to show: a pre-existing
// "upload", and the fake agent writes "outputs" each turn so the post-turn `workspace` nudge
// makes new files appear live in the Outputs section.
const ws = mkdtempSync(join(tmpdir(), 'tsn-preview-'));
mkdirSync(join(ws, 'uploads'), { recursive: true });
mkdirSync(join(ws, 'out'), { recursive: true });
writeFileSync(join(ws, 'uploads', 'example_invoice.txt'), 'ACME Corp — Invoice #42\nTotal: $1,234.00\n');

// Simulated tool activity, so the Rung 1 trace stream is visible without the real SDK (the echo
// agent makes no real tool calls). Mirrors the shape of a real authoring turn's verify loop.
const STEPS = [
  'reading the document',
  'running tsn-check',
  'running tsn-typecheck',
  'running tsn-run repo_workspace/examples/geometry.tsn',
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
    // Leave "outputs" behind so the Outputs section fills in via the post-turn `workspace` nudge.
    writeFileSync(join(ws, 'out', 'program.tsn'), '(defnetwork demo)\n');
    writeFileSync(join(ws, 'out', 'recap.md'), '# Recap\nA demo extractor.\n');
    return { text: `(fake agent) you said: ${prompt}`, sessionId: sessionId ?? 'preview' };
  },
};

const port = Number(process.env.PORT ?? 8787);
createServer({ agent: fakeAgent, workspaceDir: ws }).listen(port, '127.0.0.1', () =>
  console.log(`UI preview (fake agent) on http://localhost:${port} (workspace: ${ws})`),
);
