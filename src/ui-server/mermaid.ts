import type { DataNetwork } from "../data-network/data-network.js";

const nodeId = (id: string) => id.replace(/\./g, "_");

export function networkToMermaid(net: DataNetwork): string {
  const lines: string[] = ["flowchart-elk LR"];

  for (const [id, cell] of net.cells) {
    const label = cell.content !== undefined ? `${id} = ${cell.content}` : id;
    lines.push(`  ${nodeId(id)}(["${label}"])`);
  }

  for (const [id, prop] of net.propagators) {
    const label = prop.fn === "__SWITCH" ? "⇄" : prop.fn;
    lines.push(`  ${nodeId(id)}["${label}"]`);
    for (const from of prop.from) {
      lines.push(`  ${nodeId(from)} --> ${nodeId(id)}`);
    }
    lines.push(`  ${nodeId(id)} --> ${nodeId(prop.to)}`);
  }

  return lines.join("\n");
}
