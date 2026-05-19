import { parseNetwork } from "../data-network/tree-to-network.js";
import { astToDataNetwork } from "../data-network/ast-to-data-network.js";
import type { Registry } from "../registry.js";
import { NetworkRuntime } from "./runtime.js";

export function readNetwork(dsl: string, registry: Registry): NetworkRuntime {
  return new NetworkRuntime(astToDataNetwork(parseNetwork(dsl)), registry);
}
