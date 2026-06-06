import { createRegistry } from "../../registry.js";
import type { Registry } from "../../registry.js";
import type { ProgramAST } from "../../data-network/types.js";
import { typeRefToString } from "../../data-network/types.js";
import type { Sandbox } from "./runtime.js";
import { callLLMFn } from "../llmfn-client.js";
import { toolsFromConfig } from "../tools.js";
import { compileGrammar } from "../grammar-runtime.js";
import { compileExtract, type GrammarLeaves } from "../extract-runtime.js";
import { compileTTable } from "../ttable-runtime.js";
import { deriveProtocol } from "../../data-network/schema.js";
import { Something, Contradiction } from "../../info-structure.js";
import { Deferred } from "../../information-structures/deferred.js";
import { APromise } from "../../information-structures/apromise.js";
import { defaultExecutor } from "../../network-impl/executor.js";

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

  for (const llmFn of program.llmFns) {
    const protocol = deriveProtocol(llmFn.returnType, program);
    const config = {
      model:       llmFn.config["model"],
      maxTokens:   llmFn.config["max_tokens"] !== undefined
        ? parseInt(llmFn.config["max_tokens"], 10)
        : undefined,
      tools:       toolsFromConfig(llmFn.config["tools"]),
    };
    const paramNames = llmFn.params.map(p => p.name);
    registry.register({
      fnName: llmFn.name,
      arity: llmFn.params.length,
      impl: (...args: unknown[]) => {
        const namedArgs = Object.fromEntries(paramNames.map((n, i) => [n, args[i]]));
        const d = new Deferred<unknown>();
        // Submit the leaf model call to the bounded executor: it runs now if a slot
        // is free, otherwise it parks until one opens. The APromise handle returns
        // immediately either way, so map's eager fan-out becomes eager *scheduling*.
        defaultExecutor.submit(() => callLLMFn(llmFn.prompt, namedArgs, protocol, config))
          .then(v => d.resolve(new Something(v)))
          .catch(e => d.resolve(new Contradiction("llmfn/error", new Set(), e)));
        return new APromise(d);
      },
      morphism: { from: llmFn.params.map(p => p.predicate), to: typeRefToString(llmFn.returnType) },
    });
  }

  // Grammars are exposed under `grammar/<name>` (mirroring `network/<name>`) so a
  // `propagate grammar/<name> from [text] to cell` resolves through the ordinary
  // registry path. compileGrammar throws here on a bad Ohm source or a name mismatch,
  // surfacing at program-compile time.
  const grammarLeaves: GrammarLeaves = {};
  for (const grammar of program.grammars) {
    const { arity, impl, scan } = compileGrammar(grammar, program, sandbox);
    grammarLeaves[`grammar/${grammar.name}`] = { impl, scan };
    const sig = grammar.signature;
    registry.register({
      fnName: `grammar/${grammar.name}`,
      arity,
      impl,
      morphism: {
        from: sig ? sig.params.map(p => p.predicate) : ["String?"],
        to:   sig ? typeRefToString(sig.returnType) : "String?",
      },
    });
  }

  // An extract is callable as `extract/<name>` (mirroring grammar/network), so a
  // `propagate extract/<name> from [doc] to cell` resolves through the registry. Its
  // impl orchestrates the grammar leaves above and returns the root record. The root
  // `within` names the target record, so the morphism returns `<Root>?`.
  for (const extract of program.extracts) {
    const { arity, impl } = compileExtract(extract, grammarLeaves);
    registry.register({
      fnName: `extract/${extract.name}`,
      arity,
      impl,
      morphism: { from: ["String?"], to: `${extract.root.target}?` },
    });
  }

  // A TTable is callable as `TTable/<name>` (text → [Row?]), mirroring grammar/extract.
  for (const ttable of program.ttables) {
    const { arity, impl } = compileTTable(ttable, program, sandbox);
    registry.register({
      fnName: `TTable/${ttable.name}`,
      arity,
      impl,
      morphism: { from: ["String?"], to: `[${ttable.row}?]` },
    });
  }

  return registry;
}
