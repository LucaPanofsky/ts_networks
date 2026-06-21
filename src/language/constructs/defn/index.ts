import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { FnNode } from "./ast.js";
import { parseFn } from "./parse.js";
import { emitFn } from "./emit.js";

const fnModule: ConstructModule<FnNode> = {
  kind: ConstructKind.Fn,
  parse: parseFn,
  emit: emitFn,
};

export default fnModule;
