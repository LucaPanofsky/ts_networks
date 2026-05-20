import { astToDataNetwork } from "../../data-network/ast-to-data-network.js";
import { NetworkRuntime } from "../../network-impl/runtime.js";
import type { Registry } from "../../registry.js";
import type { ProgramAST } from "../../data-network/types.js";

export function buildNetworks(program: ProgramAST, registry: Registry): Map<string, NetworkRuntime> {
  const networks = new Map<string, NetworkRuntime>();
  for (const ast of program.networks) {
    networks.set(ast.name, new NetworkRuntime(astToDataNetwork(ast), registry));
  }
  return networks;
}
