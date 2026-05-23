import { parseProgram } from "../../data-network/tree-to-network.js";
import { createSandbox, type Sandbox } from "./runtime.js";
import { buildRegistry } from "./registry.js";
import { buildNetworks } from "./networks.js";
import type { Registry } from "../../registry.js";
import type { NetworkRuntime } from "../../network-impl/runtime.js";

export type CompiledProgram = {
  sandbox:  Sandbox;
  registry: Registry;
  networks: Map<string, NetworkRuntime>;
};

export function compile(dsl: string): CompiledProgram {
  const program  = parseProgram(dsl);
  const sandbox  = createSandbox(program);
  const registry = buildRegistry(program, sandbox);
  const networks = buildNetworks(program, registry);
  return { sandbox, registry, networks };
}
