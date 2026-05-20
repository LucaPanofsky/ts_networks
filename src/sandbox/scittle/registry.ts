import { createRegistry } from "../../registry.js";
import type { Registry } from "../../registry.js";
import type { ProgramAST } from "../../data-network/types.js";
import type { Sandbox } from "./runtime.js";

export function buildRegistry(program: ProgramAST, sandbox: Sandbox): Registry {
  const registry = createRegistry();

  for (const fn of program.fns) {
    registry.register({
      fnName: fn.name,
      arity: fn.params.length,
      impl: sandbox[fn.name]!,
      morphism: { from: fn.params.map(p => p.predicate), to: fn.returnType },
    });
  }

  for (const rec of program.records) {
    registry.register({
      fnName: rec.name,
      arity: rec.fields.length,
      impl: sandbox[rec.name]!,
      morphism: { from: rec.fields.map(f => f.predicate), to: `${rec.name}?` },
    });

    for (const field of rec.fields) {
      const key = field.name;
      registry.register({
        fnName: `${rec.name}.${key}`,
        arity: 1,
        impl: (v: unknown) => (v as Record<string, unknown>)[key],
        morphism: { from: [`${rec.name}?`], to: field.predicate },
      });
    }
  }

  return registry;
}
