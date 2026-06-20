import { emitJs } from "../../src/language/index.js";
import { loadProgram } from "../../src/language/runtime/load.js";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { astToDataNetwork } from "../../src/data-network/ast-to-data-network.js";
import { NetworkRuntime } from "../../src/network-impl/runtime.js";

// Build a program's networks as raw `NetworkRuntime`s — for engine-level tests that need the
// synchronous `invoke()` + direct InfoStructure inspection the retired jsgen `compile().networks`
// map used to give (which the projected `run`/`run-compiled` operations deliberately flatten away).
//
// `loadProgram(emitJs(source))` populates a registry with the program's fns / predicates / llmfns
// (so leaf references resolve), and each `NetworkRuntime` is built from the SAME `astToDataNetwork`
// the runtime itself uses. Self-recursion stays internal to the runner (`onRecurse`), so these run
// synchronously; a `propagate <fn> as mapping` over a single vector input is validated by
// `astToDataNetwork` here, exactly as before.
export function buildNetworks(source: string): Map<string, NetworkRuntime> {
  const backing = loadProgram(emitJs(source)).registry.backing;
  const program = parseProgram(source);
  const networks = new Map<string, NetworkRuntime>();
  for (const net of program.networks) {
    networks.set(net.name, new NetworkRuntime(astToDataNetwork(net), backing));
  }
  return networks;
}
