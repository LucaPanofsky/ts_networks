import { createRegistry } from "../../registry.js";
import type { Registry } from "../../registry.js";
import type { ProgramAST } from "../../data-network/types.js";
import { typeRefToString } from "../../data-network/types.js";
import type { Sandbox } from "./runtime.js";
import { callLLMFn } from "../llmfn-client.js";
import { toolsFromConfig as sandboxToolsFromConfig, type ToolResolver } from "../tools.js";
import { compileGrammar } from "../grammar-runtime.js";
import { compileExtract, type GrammarLeaves } from "../extract-runtime.js";
import { compileTTable } from "../ttable-runtime.js";
import { deriveProtocol } from "../../data-network/schema.js";
import { Something, Contradiction } from "../../info-structure.js";
import { Deferred } from "../../information-structures/deferred.js";
import { APromise } from "../../information-structures/apromise.js";
import { defaultExecutor } from "../../network-impl/executor.js";

const trueP = (v: unknown): boolean => v === true;

// A deterministic cache key for an arg tuple: object keys are sorted recursively so two
// structurally-equal records (in any key order) map to the same entry — consistent with
// the value-equality the merge protocol uses. JSON limits (NaN/Infinity collapse to
// null) are immaterial for the string/record inputs an llmfn leaf takes.
function canonicalKey(args: unknown[]): string {
  return JSON.stringify(args, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

function registerBuiltins(registry: Registry): void {
  registry.register({
    fnName: "true?",
    arity: 1,
    impl: trueP,
    morphism: { from: ["Any?"], to: "Boolean?" },
  });
}

// `toolsFromConfig` is injected so the sandbox stays decoupled from the operations
// layer: by default an llmfn only sees the self-contained `parse` tool (sandbox
// registry); the `run` operation injects the full program-reasoning resolver
// (operations/tools.ts) when it compiles a program for execution.
export function buildRegistry(
  program: ProgramAST,
  sandbox: Sandbox,
  toolsFromConfig: ToolResolver = sandboxToolsFromConfig,
): Registry {
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
      // The stable system prompt (if any), sent on the `system` channel.
      system:      llmFn.system,
    };
    const paramNames = llmFn.params.map(p => p.name);
    // Memoize the impure leaf on its inputs for the lifetime of this compiled program
    // (per-run: the `run` op compiles per invocation). A propagator may fire more than
    // once over the same inputs — the async runner does no coalescing — and the model
    // assumes propagators are pure, so re-firing must be a no-op. Keying the APromise at
    // submission makes a re-fire share the in-flight call (one API call, not a duplicate)
    // AND return the same reference, so re-merging the result can't self-contradict. The
    // shared APromise resolves once for all observers — to a value or a Contradiction.
    const memo = new Map<string, APromise<unknown>>();
    registry.register({
      fnName: llmFn.name,
      arity: llmFn.params.length,
      impl: (...args: unknown[]) => {
        const cached = memo.get(canonicalKey(args));
        if (cached) return cached;
        const namedArgs = Object.fromEntries(paramNames.map((n, i) => [n, args[i]]));
        const d = new Deferred<unknown>();
        const ap = new APromise(d);
        memo.set(canonicalKey(args), ap);
        // Submit the leaf model call to the bounded executor: it runs now if a slot
        // is free, otherwise it parks until one opens. The APromise handle returns
        // immediately either way, so map's eager fan-out becomes eager *scheduling*.
        defaultExecutor.submit(() => callLLMFn(llmFn.user, namedArgs, protocol, config))
          .then(v => d.resolve(new Something(v)))
          .catch(e => d.resolve(new Contradiction("llmfn/error", new Set(), e)));
        return ap;
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

  // A TTable is callable as `TTable/<name>` (text → [Row?]), mirroring grammar/extract.
  // It is ALSO an extract leaf: a `scan … using TTable/<name>` bind delegates the region
  // to the table. So add it to the extract leaf map (impl only, no span-aware scan —
  // table rows are terminal) BEFORE compiling the extracts that may reference it.
  for (const ttable of program.ttables) {
    const { arity, impl } = compileTTable(ttable, program, sandbox);
    grammarLeaves[`TTable/${ttable.name}`] = { impl };
    registry.register({
      fnName: `TTable/${ttable.name}`,
      arity,
      impl,
      morphism: { from: ["String?"], to: `[${ttable.row}?]` },
    });
  }

  // An extract is callable as `extract/<name>` (mirroring grammar/network), so a
  // `propagate extract/<name> from [doc] to cell` resolves through the registry. Its
  // impl orchestrates the grammar/TTable leaves above and returns the root record.
  for (const extract of program.extracts) {
    const { arity, impl } = compileExtract(extract, grammarLeaves);
    registry.register({
      fnName: `extract/${extract.name}`,
      arity,
      impl,
      morphism: { from: ["String?"], to: `${extract.root.target}?` },
    });
  }

  return registry;
}
