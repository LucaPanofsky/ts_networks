import type { DataNetwork, Propagator } from "../data-network/data-network.js";

export type DiagramResult = {
  diagram: string;
  details: Record<string, string>;
};

const nodeId = (id: string) => id.replace(/\./g, "_");

function propagatorNode(nid: string, prop: Propagator): string {
  if (prop.fn === "__SWITCH") {
    const predicate = prop.params["predicate"];
    const label = !predicate || predicate === "true?" ? "⇄" : predicate;
    return `  ${nid}@{ shape: delay, label: "${label}" }`;
  }
  return `  ${nid}@{ shape: lean-r, label: "${prop.fn}" }`;
}

function cellDetail(id: string, content: unknown, isConstant: boolean): string {
  let s = `<strong>Cell</strong>: ${id}`;
  if (content !== undefined) s += `<br><strong>Value</strong>: ${content}`;
  if (isConstant) s += ` <em>(constant)</em>`;
  return s;
}

function propagatorDetail(prop: Propagator): string {
  let s: string;
  if (prop.fn === "__SWITCH") {
    const predicate = prop.params["predicate"];
    s = `<strong>Switch</strong>`;
    if (predicate && predicate !== "true?") s += `<br><strong>Predicate</strong>: ${predicate}`;
  } else {
    s = `<strong>Propagator</strong>: ${prop.fn}`;
  }
  s += `<br><strong>From</strong>: ${prop.from.join(", ") || "—"}`;
  s += `<br><strong>To</strong>: ${prop.to}`;
  return s;
}

export function networkToDiagram(net: DataNetwork): DiagramResult {
  const lines: string[] = ["flowchart-elk LR"];
  const details: Record<string, string> = {};

  for (const [id, cell] of net.cells) {
    const nid = nodeId(id);
    const label = cell.content !== undefined ? `${id} = ${cell.content}` : id;
    lines.push(`  ${nid}@{ shape: rounded, label: "${label}" }`);
    lines.push(`  click ${nid} openDetail`);
    details[nid] = cellDetail(id, cell.content, cell.isConstant);
  }

  for (const [id, prop] of net.propagators) {
    const nid = nodeId(id);
    lines.push(propagatorNode(nid, prop));
    lines.push(`  click ${nid} openDetail`);
    for (const from of prop.from) {
      lines.push(`  ${nodeId(from)} --> ${nid}`);
    }
    lines.push(`  ${nid} --> ${nodeId(prop.to)}`);
    details[nid] = propagatorDetail(prop);
  }

  return { diagram: lines.join("\n"), details };
}
