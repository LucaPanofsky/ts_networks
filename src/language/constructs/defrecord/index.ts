import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { RecordNode } from "./ast.js";
import { parseRecord } from "./parse.js";
import { emitRecord } from "./emit.js";

const recordModule: ConstructModule<RecordNode> = {
  kind: ConstructKind.Record,
  parse: parseRecord,
  emit: emitRecord,
};

export default recordModule;
