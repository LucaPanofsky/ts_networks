import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { LlmFnNode } from "./ast.js";
import { parseLlmFn } from "./parse.js";
import { emitLlmFn } from "./emit.js";

const llmfnModule: ConstructModule<LlmFnNode> = {
  kind: ConstructKind.Llmfn,
  parse: parseLlmFn,
  emit: emitLlmFn,
};

export default llmfnModule;
