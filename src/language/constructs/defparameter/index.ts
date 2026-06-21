import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { ParameterNode } from "./ast.js";
import { parseParameter } from "./parse.js";
import { emitParameter } from "./emit.js";

const parameterModule: ConstructModule<ParameterNode> = {
  kind: ConstructKind.Parameter,
  parse: parseParameter,
  emit: emitParameter,
};

export default parameterModule;
