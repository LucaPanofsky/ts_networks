import { astToDataNetwork } from "../../data-network/ast-to-data-network.js";
import { NetworkRuntime } from "../../network-impl/runtime.js";
import type { Registry } from "../../registry.js";
import type { ProgramAST } from "../../data-network/types.js";
import { Contradiction } from "../../info-structure.js";
import { Deferred } from "../../information-structures/deferred.js";
import { APromise } from "../../information-structures/apromise.js";

// Networks are callable: a network with `signature: from [a, b] to out` behaves as
// a function of arity 2. We expose each one in the registry under a `network/<name>`
// key so a `propagate network/<name> from [...] to cell` statement resolves through
// the ordinary registry path — no special-casing in the runtime. The namespace also
// keeps network names from ever colliding with plain function names.
//
// (Bare self-reference `propagate <ownName>` stays a __RECURSIVE restart-in-place,
// handled in astToDataNetwork; `network/<ownName>` is instead a fresh sub-invocation.)
export function buildNetworks(program: ProgramAST, registry: Registry): Map<string, NetworkRuntime> {
  const networks = new Map<string, NetworkRuntime>();

  // Pass 1 — register every network as a callable BEFORE building any runtime. A
  // runtime that references `network/<other>` resolves the entry at construction
  // time, so the entry must already exist even though the target runtime does not.
  // The impl is late-bound: it reads `networks.get(name)` only when *called*, by
  // which point pass 2 has populated the map (this is what makes mutual recursion
  // and self sub-invocation work).
  for (const ast of program.networks) {
    const name = ast.name;
    const inputCells = ast.signature.from; // positional → these cell names
    const outputCell = ast.signature.to;   // the single value to unwrap
    registry.register({
      fnName: `network/${name}`,
      arity: inputCells.length,
      // A sub-network is an async leaf, just like a defllmfn: map the positional
      // args onto the sub-network's input cells, run it, and project its output
      // cell back. The APromise handle returns immediately; the Deferred is
      // resolved with the output cell's InfoStructure (Something/Nothing/...), or a
      // Contradiction if the sub-run hit one. Late-bound: the runtime is resolved
      // from `networks` only here, at call time.
      impl: (...args: unknown[]) => {
        const d = new Deferred<unknown>();
        const inputs: Record<string, unknown> = {};
        for (let i = 0; i < inputCells.length; i++) inputs[inputCells[i]!] = args[i];
        networks.get(name)!
          .invokeAsync(inputs)
          .then(res => {
            if (res.type === "exit") {
              d.resolve(new Contradiction("network/contradiction", new Set(), res.reason));
            } else {
              // "unwrap the response": the value is whatever the output cell knows.
              d.resolve(res.cells.get(outputCell)!.knows());
            }
          })
          .catch(e => d.resolve(new Contradiction("network/error", new Set(), e)));
        return new APromise(d);
      },
      // Networks declare no cell types, so the morphism is permissive.
      morphism: { from: inputCells.map(() => "Any?"), to: "Any?" },
    });
  }

  // Pass 2 — build the runtimes.
  for (const ast of program.networks) {
    networks.set(ast.name, new NetworkRuntime(astToDataNetwork(ast), registry));
  }

  return networks;
}
