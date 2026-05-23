import { readFileSync } from "fs";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { astToDataNetwork } from "../../src/data-network/ast-to-data-network.js";
import { networkToMermaid } from "../../src/ui-server/mermaid.js";

// ── documentPipeline ──────────────────────────────────────────────────────────

const src = readFileSync("examples/agentic_network_document_analysis_example.tsn", "utf8");
const net = astToDataNetwork(parseProgram(src).networks[0]!);
const chart = networkToMermaid(net);

test("documentPipeline: matches expected output", () => {
  expect(chart).toBe(
    [
      "flowchart LR",
      `  text(["text"])`,
      `  analysis(["analysis"])`,
      `  label(["label"])`,
      `  analyzeDocument__text__to__analysis["analyzeDocument"]`,
      `  text --> analyzeDocument__text__to__analysis`,
      `  analyzeDocument__text__to__analysis --> analysis`,
      `  classifyResult__analysis__to__label["classifyResult"]`,
      `  analysis --> classifyResult__analysis__to__label`,
      `  classifyResult__analysis__to__label --> label`,
    ].join("\n")
  );
});

// ── dotted fn name ────────────────────────────────────────────────────────────

const dottedSrc = `
defnetwork dottedPipeline
  signature: from [input] to output;
  propagate some.module.fn from [input] to output;
end
`.trim();

const dottedChart = networkToMermaid(astToDataNetwork(parseProgram(dottedSrc).networks[0]!));

test("dotted fn name: node ids contain no dots", () => {
  for (const line of dottedChart.split("\n").slice(1)) {
    const id = line.trim().split(/[\s([]/)[0]!;
    expect(id).not.toContain(".");
  }
});

test("dotted fn name: label preserves dotted name", () => {
  expect(dottedChart).toContain('"some.module.fn"');
});
