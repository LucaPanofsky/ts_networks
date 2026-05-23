import { createRegistry } from "../../registry.js";
import type { Registry } from "../../registry.js";
import type { ProgramAST } from "../../data-network/types.js";
import { typeRefToString } from "../../data-network/types.js";
import type { Sandbox } from "./runtime.js";

const trueP = (v: unknown): boolean => v === true;

function registerBuiltins(registry: Registry): void {
  registry.register({
    fnName: "true?",
    arity: 1,
    impl: trueP,
    morphism: { from: ["Any?"], to: "Boolean?" },
  });
}

export function buildRegistry(program: ProgramAST, sandbox: Sandbox): Registry {
  const registry = createRegistry();
  registerBuiltins(registry);

  for (const fn of program.fns) {
    registry.register({
      fnName: fn.name,
      arity: fn.params.length,
      impl: sandbox[fn.name]!,
      morphism: { from: fn.params.map(p => p.predicate), to: typeRefToString(fn.returnType) },
    });
  }

  for (const rec of program.records) {
    registry.register({
      fnName: rec.name,
      arity: rec.fields.length,
      impl: sandbox[rec.name]!,
      morphism: { from: rec.fields.map(f => typeRefToString(f.type)), to: `${rec.name}?` },
    });

    for (const field of rec.fields) {
      const key = field.name;
      registry.register({
        fnName: `${rec.name}.${key}`,
        arity: 1,
        impl: (v: unknown) => (v as Record<string, unknown>)[key],
        morphism: { from: [`${rec.name}?`], to: typeRefToString(field.type) },
      });
    }
  }

  return registry;
}
