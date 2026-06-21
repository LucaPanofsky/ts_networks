import { deflateSync } from "node:zlib";
import { parseProgramStrict } from "../language/parse-strict.js";
import { networksOf } from "../language/select.js";
import type { NetworkNode } from "../language/constructs/defnetwork/ast.js";
import type { Operation } from "./types.js";

// Render a network as a Mermaid flowchart. Pure core (networkToMermaid / mermaidLiveUrl)
// kept separate from the operation so it is unit-testable. Style: cells are rounded
// nodes, operations (propagate/switch) are rectangles, a 2-input switch labels its edges
// cond/value, a recursive propagate (fn === the network's own name) is marked ⟲ and gets
// dotted edges back to the signature inputs — making the recursion explicit in the graph.

// Claude palette, matching the analysis report theme.
const CLASSDEFS = [
  "  classDef cell fill:#faf9f5,stroke:#d97757,color:#1a1a1a;",
  "  classDef op fill:#f0eee6,stroke:#6a8f5f,color:#1a1a1a;",
];

// Mermaid node ids must be identifier-safe; cell names already are, but be defensive
// (a qualified name could contain `/` or `.`).
const sid = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, "_");

export function networkToMermaid(net: NetworkNode): string {
  // Collect cells in appearance order: signature inputs, the output, then term cells.
  const cellNames: string[] = [];
  const seen = new Set<string>();
  const addCell = (n: string) => { if (!seen.has(n)) { seen.add(n); cellNames.push(n); } };
  for (const c of net.signature.from) addCell(c);
  addCell(net.signature.to);
  for (const t of net.terms) {
    if (t.kind === "propagate" || t.kind === "switch") {
      for (const c of t.from) addCell(c);
      addCell(t.to);
    } else {
      addCell(t.name);
    }
  }

  const opNodes: string[] = [];
  const edges: string[] = [];
  const recursions: string[] = [];
  const opIds: string[] = [];

  net.terms.forEach((t, i) => {
    if (t.kind === "propagate") {
      const id = `${sid(t.fn)}_${i}`;
      opIds.push(id);
      const recursive = t.fn === net.name;
      opNodes.push(`  ${id}["${recursive ? `${t.fn} ⟲` : t.fn}"]`);
      for (const c of t.from) edges.push(`  ${sid(c)} --> ${id}`);
      edges.push(`  ${id} --> ${sid(t.to)}`);
      // The recursive call re-instantiates the network: draw it feeding the inputs back.
      if (recursive) for (const inp of net.signature.from) recursions.push(`  ${id} -.->|recurse| ${sid(inp)}`);
    } else if (t.kind === "switch") {
      const id = `switch_${i}`;
      opIds.push(id);
      opNodes.push(`  ${id}["${t.fn ? `switch ${t.fn}` : "switch"}"]`);
      // A 2-input switch is [condition, value]; label the edges so the gate reads clearly.
      if (t.from.length >= 2) {
        edges.push(`  ${sid(t.from[0]!)} -- cond --> ${id}`);
        edges.push(`  ${sid(t.from[1]!)} -- value --> ${id}`);
        for (let k = 2; k < t.from.length; k++) edges.push(`  ${sid(t.from[k]!)} --> ${id}`);
      } else {
        for (const c of t.from) edges.push(`  ${sid(c)} --> ${id}`);
      }
      edges.push(`  ${id} --> ${sid(t.to)}`);
    }
    // cell / constant terms contribute only a cell node (already collected above).
  });

  const lines: string[] = ["flowchart TD", "", "  %% cells"];
  for (const n of cellNames) lines.push(`  ${sid(n)}([${n}])`);
  lines.push("", "  %% operations", ...opNodes, "", ...edges);
  if (recursions.length > 0) {
    lines.push("", "  %% recursion: the recursive call re-seeds the signature inputs", ...recursions);
  }
  lines.push("", ...CLASSDEFS);
  if (cellNames.length > 0) lines.push(`  class ${cellNames.map(sid).join(",")} cell;`);
  if (opIds.length > 0) lines.push(`  class ${opIds.join(",")} op;`);
  return lines.join("\n");
}

// Encode a diagram as a mermaid.live editor link. mermaid.live's state is a JSON wrapper,
// zlib-deflated then base64url-encoded behind a `pako:` prefix — NOT plain base64. We
// deflate at level 9 to match the editor's own `eNq…` output.
export function mermaidLiveUrl(diagram: string): string {
  const state = {
    code: diagram,
    mermaid: JSON.stringify({ theme: "default" }),
    autoSync: true,
    updateDiagram: true,
  };
  const packed = deflateSync(Buffer.from(JSON.stringify(state), "utf8"), { level: 9 });
  return `https://mermaid.live/edit#pako:${packed.toString("base64url")}`;
}

type DiagramInput = { source: string; network?: string; live?: boolean };
type DiagramOutput =
  | { ok: true; diagram: string; url?: string }
  | { ok: false; error: string };

export const diagram: Operation<DiagramInput, DiagramOutput> = {
  name: "diagram",
  description:
    "Render a ts-networks network as a Mermaid flowchart (cells, operations, switch cond/value labels, explicit recursion). With live=true, also return a mermaid.live editor link.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code." },
      network: { type: "string", description: "Name of the network to diagram (optional if the program defines exactly one)." },
      live: { type: "boolean", description: "If true, also return a mermaid.live editor link for the diagram." },
    },
    required: ["source"],
  },
  handle(input) {
    let networks: NetworkNode[];
    try {
      networks = networksOf(parseProgramStrict(input.source));
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    if (networks.length === 0) return { ok: false, error: "no networks defined in the program" };

    let net: NetworkNode | undefined;
    if (input.network) {
      net = networks.find(n => n.name === input.network);
      if (!net) return { ok: false, error: `unknown network "${input.network}" — available: ${networks.map(n => n.name).join(", ")}` };
    } else if (networks.length === 1) {
      net = networks[0]!;
    } else {
      return { ok: false, error: `program defines ${networks.length} networks; pass one of: ${networks.map(n => n.name).join(", ")}` };
    }

    const d = networkToMermaid(net);
    return input.live ? { ok: true, diagram: d, url: mermaidLiveUrl(d) } : { ok: true, diagram: d };
  },
};
