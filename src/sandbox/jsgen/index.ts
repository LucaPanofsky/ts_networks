import { parseProgram } from "../../data-network/tree-to-network.js";
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
  const program  = parseProgram(dsl);
  const sandbox  = createSandbox(program);
  const registry = buildRegistry(program, sandbox, toolsFromConfig);
  const networks = buildNetworks(program, registry);
  return { sandbox, registry, networks };
}
