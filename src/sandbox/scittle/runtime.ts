import { loadString } from "nbb";
import type { ProgramAST } from "../../data-network/types.js";
import { compileProgram } from "./compiler.js";

export type Sandbox = Record<string, (...args: unknown[]) => unknown>;

function exportedNames(program: ProgramAST): string[] {
  return [
    ...program.records.flatMap(r => [r.name, `${r.name}?`]),
    ...program.fns.map(f => f.name),
  ];
}

function buildExportMap(names: string[]): string {
  const entries = names.map(n => `"${n}" ${n}`).join(" ");
  return `#js {${entries}}`;
}

export async function createSandbox(program: ProgramAST): Promise<Sandbox> {
  const names = exportedNames(program);
  const source = compileProgram(program, [buildExportMap(names)]);
  return loadString(source, {}) as Promise<Sandbox>;
}
