import { inflateSync } from "node:zlib";
import { diagram, networkToMermaid, mermaidLiveUrl } from "../../src/operations/diagram.js";
import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
import { networksOf } from "../../src/language/select.js";

// A network exercising every shape the renderer must handle: a plain propagate, a
// 1-input switch-with-predicate, a 2-input gate switch, and a recursive propagate.
// (Parse is structural — the referenced fns need not be defined for the AST to build.)
const loopSrc = `
defnetwork loop
  signature: from [seed, prompt, log] to out;
  propagate engineer from [seed, log] to candidate;
  switch approved? from [candidate] to approved;
  switch from [approved, candidate] to out;
  propagate loop from [seed, prompt, log] to out;
end
`;

const net = () => networksOf(parseProgram(loopSrc))[0]!;

describe("networkToMermaid", () => {
  const m = networkToMermaid(net());

  it("opens as a flowchart", () => {
    expect(m.startsWith("flowchart TD")).toBe(true);
  });

  it("renders cells as rounded nodes", () => {
    for (const c of ["seed", "prompt", "log", "candidate", "approved", "out"]) {
      expect(m).toContain(`${c}([${c}])`);
    }
  });

  it("renders propagators and switches as labeled operation nodes", () => {
    expect(m).toContain(`["engineer"]`);
    expect(m).toContain(`["switch approved?"]`);   // predicate switch keeps its predicate
    expect(m).toContain(`["switch"]`);              // bare gate switch
  });

  it("labels a 2-input switch's edges cond/value", () => {
    expect(m).toContain("-- cond -->");
    expect(m).toContain("-- value -->");
  });

  it("marks the recursive propagate and draws dotted edges back to every signature input", () => {
    expect(m).toContain(`["loop ⟲"]`);
    // one dotted recurse edge per signature input
    expect(m).toMatch(/-\.->\|recurse\| seed/);
    expect(m).toMatch(/-\.->\|recurse\| prompt/);
    expect(m).toMatch(/-\.->\|recurse\| log/);
  });

  it("emits the Claude-palette classDefs and classes the nodes", () => {
    expect(m).toContain("classDef cell fill:#faf9f5");
    expect(m).toContain("classDef op fill:#f0eee6");
    expect(m).toMatch(/class .*\bcell;/);
    expect(m).toMatch(/class .*\bop;/);
  });

  it("does not draw cond/value on a 1-input predicate switch", () => {
    // The approved? switch (term 1) has a single input; its edge is plain.
    expect(m).toContain("candidate --> switch_1");
  });
});

describe("mermaidLiveUrl", () => {
  const m = networkToMermaid(net());
  const url = mermaidLiveUrl(m);

  it("returns a mermaid.live editor pako link", () => {
    expect(url.startsWith("https://mermaid.live/edit#pako:")).toBe(true);
  });

  it("round-trips: the encoded payload inflates back to the exact diagram", () => {
    const payload = url.slice("https://mermaid.live/edit#pako:".length);
    const json = inflateSync(Buffer.from(payload, "base64url")).toString("utf8");
    const state = JSON.parse(json);
    expect(state.code).toBe(m);
  });
});

describe("diagram operation", () => {
  it("returns the diagram for the sole network without naming it", () => {
    const r = diagram.handle({ source: loopSrc });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diagram).toContain(`["loop ⟲"]`);
      expect(r.url).toBeUndefined();
    }
  });

  it("includes a live url when live=true", () => {
    const r = diagram.handle({ source: loopSrc, live: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url?.startsWith("https://mermaid.live/edit#pako:")).toBe(true);
  });

  it("requires a network name when the program defines more than one", () => {
    const two = `${loopSrc}\ndefnetwork other\n  signature: from [x] to y;\n  propagate f from [x] to y;\nend\n`;
    const r = diagram.handle({ source: two });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("pass one of");
  });

  it("selects a named network out of several", () => {
    const two = `${loopSrc}\ndefnetwork other\n  signature: from [x] to y;\n  propagate f from [x] to y;\nend\n`;
    const r = diagram.handle({ source: two, network: "other" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.diagram).toContain(`["f"]`);
  });

  it("rejects an unknown network name with the available list", () => {
    const r = diagram.handle({ source: loopSrc, network: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unknown network");
  });
});
