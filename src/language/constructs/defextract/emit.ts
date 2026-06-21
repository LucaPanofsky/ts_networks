// An extract is a HEAVY construct: it emits a thin `rt.extract(spec, resolve, scanOf)` call
// (the runtime function is the COMPILER) and registers the orchestrator as `extract/<name>`.
// Its leaf grammars/tables are resolved BY NAME at run time — `resolve` for the impl, `scanOf`
// for the span-aware scan — so the extract and its leaves stay independent fragments and
// late binding makes emit order irrelevant. No record descriptor is inlined: the extract
// builds no records itself; its leaves do.

import type { EmitCtx } from "../../core/module.js";
import type { ExtractNode } from "./ast.js";

export function emitExtract(node: ExtractNode, ctx: EmitCtx): string {
  const key = `extract/${node.name}`;
  const local = ctx.mangle(key);
  const q = JSON.stringify;
  return [
    `const ${local} = ${ctx.rt}.extract(${q(node)}, __reg.resolve, __reg.scanOf);`,
    `__reg.register(${q(key)}, { arity: 1, impl: ${local}, morphism: { from: ${q(["String?"])}, to: ${q(`${node.root.target}?`)} } });`,
  ].join("\n");
}
