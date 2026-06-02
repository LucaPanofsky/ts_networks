import type { ProgramAST } from "../../data-network/types.js";
import { compileProgram } from "./compiler.js";
import { compileGrammar } from "../grammar-runtime.js";

export type Sandbox = Record<string, (...args: unknown[]) => unknown>;

export function createSandbox(program: ProgramAST): Sandbox {
  const source = compileProgram(program);
  // `__g` is the late-resolved grammar map the compiled bindings read from. It is
  // injected (not source) because a grammar's impl is a runtime Ohm closure that
  // captures the sandbox's record constructors — which only exist once the sandbox
  // below is built. So: build the sandbox, then fill `__g` against it.
  const grammars: Record<string, (...args: unknown[]) => unknown> = {};
  const sandbox = new Function("__g", source)(grammars) as Sandbox;
  for (const g of program.grammars) {
    grammars[`grammar/${g.name}`] = compileGrammar(g, program, sandbox).impl;
  }
  return sandbox;
}
