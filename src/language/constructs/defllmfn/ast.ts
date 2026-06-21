// The node `defllmfn` produces — an async, LLM-backed leaf. The SINGLE llmfn AST (the engine
// `LLMFnAST` twin was removed): typed params, a return type, the `user` prompt
// (data-bearing, carries `{{placeholders}}`), an optional stable `system` prompt, and the
// `with:` config (model / max_tokens / tools). It is NOT source-emitted — emit inlines this
// as a spec into a single `rt.llmFn(spec, __reg)` call (BUILD), which returns the memoized async
// leaf (RUN). See ../../core/runtime-api.ts for BUILD vs RUN.

import type { TypeRef, TypedParam } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type LlmFnNode = {
  kind: ConstructKind.Llmfn;
  name: string;
  params: TypedParam[];
  returnType: TypeRef;
  // The user prompt — the data-bearing turn; `{{path}}` placeholders are substituted at run
  // time. A bare (unlabelled) `"""…"""` block populates this too (back-compat shorthand).
  user: string;
  // The optional stable system prompt (sent on the `system` channel). Absent unless a
  // `system """…"""` clause is present.
  system?: string;
  // The `with:` clause as raw key→string pairs (String values have their quotes stripped),
  // mirroring the engine: `model`, `max_tokens`, `tools`.
  config: Record<string, string>;
};
