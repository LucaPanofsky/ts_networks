import { parseProgram } from "../../data-network/tree-to-network.js";
import { withPrelude } from "../prelude.js";
import { createSandbox, type Sandbox } from "./runtime.js";
import { buildRegistry } from "./registry.js";
import { buildNetworks } from "./networks.js";
import type { Registry } from "../../registry.js";
import type { NetworkRuntime } from "../../network-impl/runtime.js";
import type { ToolResolver } from "../tools.js";

export type CompiledProgram = {
  sandbox:  Sandbox;
  registry: Registry;
  networks: Map<string, NetworkRuntime>;
};

// `toolsFromConfig` is optional and threaded to buildRegistry: omitted, an llmfn's
// `with: tools` resolves against the sandbox's parse-only registry; the `run`
// operation passes the full program-reasoning resolver (operations/tools.ts). This
// keeps the sandbox decoupled from the operations layer (no import cycle).
export function compile(dsl: string, toolsFromConfig?: ToolResolver): CompiledProgram {
  // Merge the standard library in before anything compiles: prelude entries become both
  // sandbox consts (expression-usable) and registry entries (propagatable), shadowed by
  // any same-named user definition. Supplied here, so the user's parsed AST stays clean.
  const program  = withPrelude(parseProgram(dsl));
  const sandbox  = createSandbox(program);
  const registry = buildRegistry(program, sandbox, toolsFromConfig);
  const networks = buildNetworks(program, registry);
  return { sandbox, registry, networks };
}
