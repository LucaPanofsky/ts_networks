import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { ExtractNode } from "./ast.js";
import { parseExtract } from "./parse.js";
import { emitExtract } from "./emit.js";

const extractModule: ConstructModule<ExtractNode> = {
  kind: ConstructKind.Extract,
  keyword: "defextract",
  parse: parseExtract,
  emit: emitExtract,
};

export default extractModule;
