import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { EnumNode } from "./ast.js";
import { parseEnum } from "./parse.js";
import { emitEnum } from "./emit.js";

const enumModule: ConstructModule<EnumNode> = {
  kind: ConstructKind.Enum,
  parse: parseEnum,
  emit: emitEnum,
};

export default enumModule;
