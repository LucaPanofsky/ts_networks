import { createRegistry } from "../../registry.js";
import type { Registry } from "../../registry.js";
import type { ProgramAST } from "../../data-network/types.js";
import { typeRefToString } from "../../data-network/types.js";
import type { Sandbox } from "./runtime.js";
import { callAgent } from "../agent-client.js";
import { deriveProtocol } from "../../data-network/schema.js";
import { Something, Contradiction } from "../../info-structure.js";
import { Deferred } from "../../information-structures/deferred.js";
import { APromise } from "../../information-structures/apromise.js";

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

  for (const agent of program.agents) {
    const protocol = deriveProtocol(agent.returnType, program);
    const config = {
      model:       agent.config["model"],
      maxTokens:   agent.config["max_tokens"] !== undefined
        ? parseInt(agent.config["max_tokens"], 10)
        : undefined,
    };
    const paramNames = agent.params.map(p => p.name);
    registry.register({
      fnName: agent.name,
      arity: agent.params.length,
      impl: (...args: unknown[]) => {
        const namedArgs = Object.fromEntries(paramNames.map((n, i) => [n, args[i]]));
        const d = new Deferred<unknown>();
        callAgent(agent.prompt, namedArgs, protocol, config)
          .then(v => d.resolve(new Something(v)))
          .catch(e => d.resolve(new Contradiction("agent/error", new Set(), e)));
        return new APromise(d);
      },
      morphism: { from: agent.params.map(p => p.predicate), to: typeRefToString(agent.returnType) },
    });
  }

  return registry;
}
