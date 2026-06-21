import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { DeriveNode } from "./ast.js";
import { parseDerive } from "./parse.js";
import { emitDerive } from "./emit.js";

const deriveModule: ConstructModule<DeriveNode> = {
  kind: ConstructKind.Derive,
  parse: parseDerive,
  emit: emitDerive,
};

export default deriveModule;
