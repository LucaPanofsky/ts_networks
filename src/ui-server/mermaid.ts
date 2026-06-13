import type { DataNetwork, Propagator } from "../data-network/data-network.js";
import type { ProgramAST, TypedParam } from "../data-network/types.js";
import { typeRefToString } from "../data-network/types.js";
import type { EnrichedNetwork } from "../data-network/type-checker.js";

export type DiagramResult = {
  diagram: string;
  details: Record<string, string>;
};

const nodeId = (id: string) => id.replace(/\./g, "_");

type FnTypes = { params: TypedParam[]; returnType: string | null };

function buildTypeMap(program: ProgramAST): Map<string, FnTypes> {
  const map = new Map<string, FnTypes>();
  for (const fn of program.fns)
    map.set(fn.name, { params: fn.params, returnType: typeRefToString(fn.returnType) });
  for (const llmFn of program.llmFns)
    map.set(llmFn.name, { params: llmFn.params, returnType: typeRefToString(llmFn.returnType) });
  return map;
}

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

function propagatorDetail(prop: Propagator, types: FnTypes): string {
  const { params } = types;
  let s: string;
  if (prop.fn === "__SWITCH") {
    const predicate = prop.params["predicate"];
    s = `<strong>Switch</strong>`;
    if (predicate && predicate !== "true?") s += `<br><strong>Predicate</strong>: ${predicate}`;
  } else {
    s = `<strong>Propagator</strong>: ${prop.fn}`;
  }
  const fromLabels = prop.from.map((cell, i) => {
    const type = params[i]?.predicate;
    return type ? `${cell}: ${type}` : cell;
  });
  s += `<br><strong>From</strong>: ${fromLabels.join(", ") || "—"}`;
  s += `<br><strong>To</strong>: ${prop.to}`;
  if (types.returnType) s += `<br><strong>Returns</strong>: ${types.returnType}`;
  return s;
}

function buildErrorMaps(enriched: EnrichedNetwork): {
  errorCells: Map<string, string[]>;
  errorProps: Map<string, string[]>;
} {
  const errorCells = new Map<string, string[]>();
  const errorProps = new Map<string, string[]>();
  for (const [name, cell] of enriched.cells) {
    if (cell._errors.length > 0)
      errorCells.set(name, cell._errors.map(e => `[${e.kind}] ${e.message}`));
  }
  for (const ep of enriched.propagators) {
    if (ep._errors.length > 0) {
      const fnKey = ep.kind === "switch" ? "__SWITCH" : (ep.fn ?? "");
      const key = [fnKey, ...ep.from, "to", ep.to].join("__");
      errorProps.set(key, ep._errors.map(e => `[${e.kind}] ${e.message}`));
    }
  }
  return { errorCells, errorProps };
}

function appendErrors(base: string, msgs: string[] | undefined): string {
  if (!msgs || msgs.length === 0) return base;
  const html = msgs.map(m => `<br><span style="color:#e74c3c">${m}</span>`).join("");
  return base + html;
}

export function networkToDiagram(
  net: DataNetwork,
  program: ProgramAST,
  enriched?: EnrichedNetwork
): DiagramResult {
  const { errorCells, errorProps } = enriched
    ? buildErrorMaps(enriched)
    : { errorCells: new Map<string, string[]>(), errorProps: new Map<string, string[]>() };

  const lines: string[] = ["flowchart-elk LR"];
  const details: Record<string, string> = {};
  const typeMap = buildTypeMap(program);
  const emptyTypes: FnTypes = { params: [], returnType: null };

  for (const [id, cell] of net.cells) {
    const nid = nodeId(id);
    const label = cell.content !== undefined ? `${id} = ${cell.content}` : id;
    lines.push(`  ${nid}@{ shape: rounded, label: "${label}" }`);
    lines.push(`  click ${nid} openDetail`);
    details[nid] = appendErrors(cellDetail(id, cell.content, cell.isConstant), errorCells.get(id));
  }

  for (const [id, prop] of net.propagators) {
    const nid = nodeId(id);
    const types = typeMap.get(prop.fn) ?? emptyTypes;
    lines.push(propagatorNode(nid, prop));
    lines.push(`  click ${nid} openDetail`);
    for (let i = 0; i < prop.from.length; i++) {
      const from = prop.from[i]!;
      const type = types.params[i]?.predicate;
      const edge = type ? `  ${nodeId(from)} -->|${type}| ${nid}` : `  ${nodeId(from)} --> ${nid}`;
      lines.push(edge);
    }
    const outEdge = types.returnType
      ? `  ${nid} -->|${types.returnType}| ${nodeId(prop.to)}`
      : `  ${nid} --> ${nodeId(prop.to)}`;
    lines.push(outEdge);
    details[nid] = appendErrors(propagatorDetail(prop, types), errorProps.get(id));
  }

  for (const [id] of errorCells)
    lines.push(`  style ${nodeId(id)} fill:#c0392b,color:#fff,stroke:#922b21`);
  for (const [id] of errorProps)
    lines.push(`  style ${nodeId(id)} fill:#c0392b,color:#fff,stroke:#922b21`);

  return { diagram: lines.join("\n"), details };
}
