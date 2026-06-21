import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { GrammarNode } from "./ast.js";
import { parseGrammar } from "./parse.js";
import { emitGrammar } from "./emit.js";

const grammarModule: ConstructModule<GrammarNode> = {
  kind: ConstructKind.Grammar,
  parse: parseGrammar,
  emit: emitGrammar,
};

export default grammarModule;
