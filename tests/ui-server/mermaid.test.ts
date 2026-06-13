import { readFileSync } from "fs";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { astToDataNetwork } from "../../src/data-network/ast-to-data-network.js";
import { networkToDiagram } from "../../src/ui-server/mermaid.js";

// ── documentPipeline ──────────────────────────────────────────────────────────

const src = readFileSync("tests/fixtures/document-analysis.tsn", "utf8");
const prog = parseProgram(src);
const { diagram, details } = networkToDiagram(astToDataNetwork(prog.networks[0]!), prog);

test("documentPipeline: diagram matches expected output", () => {
  expect(diagram).toBe(
    [
      "flowchart-elk LR",
      `  text@{ shape: rounded, label: "text" }`,
      `  click text openDetail`,
      `  analysis@{ shape: rounded, label: "analysis" }`,
      `  click analysis openDetail`,
      `  label@{ shape: rounded, label: "label" }`,
      `  click label openDetail`,
      `  analyzeDocument__text__to__analysis@{ shape: lean-r, label: "analyzeDocument" }`,
      `  click analyzeDocument__text__to__analysis openDetail`,
      `  text -->|String?| analyzeDocument__text__to__analysis`,
      `  analyzeDocument__text__to__analysis -->|DocumentAnalysis?| analysis`,
      `  classifyResult__analysis__to__label@{ shape: lean-r, label: "classifyResult" }`,
      `  click classifyResult__analysis__to__label openDetail`,
      `  analysis -->|DocumentAnalysis?| classifyResult__analysis__to__label`,
      `  classifyResult__analysis__to__label -->|ClassificationLabel?| label`,
    ].join("\n")
  );
});

test("documentPipeline: details has entry for each cell and propagator", () => {
  expect(details["text"]).toContain("Cell");
  expect(details["analysis"]).toContain("Cell");
  expect(details["analyzeDocument__text__to__analysis"]).toContain("analyzeDocument");
  expect(details["classifyResult__analysis__to__label"]).toContain("classifyResult");
});

test("documentPipeline: propagator details include types", () => {
  expect(details["analyzeDocument__text__to__analysis"]).toContain("String?");
  expect(details["classifyResult__analysis__to__label"]).toContain("DocumentAnalysis?");
});

// ── switch predicate label ────────────────────────────────────────────────────

const switchSrc = `
defnetwork search
  signature: from [input] to done;
  switch goodEnough from [input] to isGood;
  switch from [input] to other;
end
`.trim();

const switchProg = parseProgram(switchSrc);
const { diagram: switchDiagram, details: switchDetails } = networkToDiagram(
  astToDataNetwork(switchProg.networks[0]!), switchProg
);

test("switch with predicate uses predicate as label", () => {
  expect(switchDiagram).toContain('shape: delay, label: "goodEnough"');
});

test("switch without predicate uses ⇄ as label", () => {
  expect(switchDiagram).toContain('shape: delay, label: "⇄"');
});

test("switch details includes predicate", () => {
  const entry = Object.values(switchDetails).find(d => d.includes("goodEnough"));
  expect(entry).toBeTruthy();
});

// ── dotted fn name ────────────────────────────────────────────────────────────

const dottedSrc = `
defnetwork dottedPipeline
  signature: from [input] to output;
  propagate some.module.fn from [input] to output;
end
`.trim();

const dottedProg = parseProgram(dottedSrc);
const { diagram: dottedDiagram } = networkToDiagram(
  astToDataNetwork(dottedProg.networks[0]!), dottedProg
);

test("dotted fn name: node ids contain no dots", () => {
  for (const line of dottedDiagram.split("\n").slice(1)) {
    const id = line.trim().split(/[\s@]/)[0]!;
    expect(id).not.toContain(".");
  }
});

test("dotted fn name: label preserves dotted name", () => {
  expect(dottedDiagram).toContain('"some.module.fn"');
});
