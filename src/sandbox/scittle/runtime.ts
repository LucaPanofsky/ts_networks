import type { ProgramAST } from "../../data-network/types.js";
import { compileProgram } from "./compiler.js";

export type Sandbox = Record<string, (...args: unknown[]) => unknown>;

export function createSandbox(program: ProgramAST): Sandbox {
  const source = compileProgram(program);
  return new Function(source)() as Sandbox;
}
