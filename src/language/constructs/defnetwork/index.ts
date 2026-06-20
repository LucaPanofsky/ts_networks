import type { ConstructModule } from "../../core/module.js";
import { ConstructKind } from "../../core/enums.js";
import type { NetworkNode } from "./ast.js";
import { parseNetwork } from "./parse.js";
import { emitNetwork } from "./emit.js";

const networkModule: ConstructModule<NetworkNode> = {
  kind: ConstructKind.Network,
  keyword: "defnetwork",
  parse: parseNetwork,
  emit: emitNetwork,
};

export default networkModule;
