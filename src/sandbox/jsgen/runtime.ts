import type { ProgramAST } from "../../data-network/types.js";
import { compileProgram } from "./compiler.js";
import { compileGrammar } from "../grammar-runtime.js";
import { renderPrompt } from "../prompt-template.js";

export type Sandbox = Record<string, (...args: unknown[]) => unknown>;

// The `__interp` helper an `interpolate` body lowers to. It renders the template
// against the function's arguments through the same `renderPrompt` that backs
// `defllmfn` prompts, so substitution semantics (dotted paths, record→JSON, missing
// → error) are identical. A missing reference is a hard error: a well-typed program
// never hits it (the type-checker validates the paths), so it only fires on a path
// the checker could not see — fail loud rather than render a silent gap.
function interpolate(template: string, args: Record<string, unknown>): string {
  const result = renderPrompt(template, args);
  if (!result.ok) {
    throw new Error(`interpolate: references undefined variable(s): ${result.missing.join(", ")}`);
  }
  return result.prompt;
}

export function createSandbox(program: ProgramAST): Sandbox {
  const source = compileProgram(program);
  // `__g` is the late-resolved grammar map the compiled bindings read from. It is
  // injected (not source) because a grammar's impl is a runtime Ohm closure that
  // captures the sandbox's record constructors — which only exist once the sandbox
  // below is built. So: build the sandbox, then fill `__g` against it.
  // `__interp` is injected for the same reason grammars are: it is a host closure,
  // not emittable source.
  const grammars: Record<string, (...args: unknown[]) => unknown> = {};
  const sandbox = new Function("__g", "__interp", source)(grammars, interpolate) as Sandbox;
  for (const g of program.grammars) {
    grammars[`grammar/${g.name}`] = compileGrammar(g, program, sandbox).impl;
  }
  return sandbox;
}
