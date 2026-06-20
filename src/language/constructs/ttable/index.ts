import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { TTableNode } from "./ast.js";
import { parseTTable } from "./parse.js";
import { emitTTable } from "./emit.js";

const ttableModule: ConstructModule<TTableNode> = {
  kind: ConstructKind.TTable,
  keyword: "TTable",
  parse: parseTTable,
  emit: emitTTable,
};

export default ttableModule;
