import { loadString } from "nbb";
import type { ProgramAST } from "../../data-network/types.js";
import { compileProgram, compileCoercedExportMap } from "./compiler.js";

export type Sandbox = Record<string, (...args: unknown[]) => unknown>;

export async function createSandbox(program: ProgramAST): Promise<Sandbox> {
  const source = compileProgram(program, [compileCoercedExportMap(program)]);
  return loadString(source, {}) as Promise<Sandbox>;
}
