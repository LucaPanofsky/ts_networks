// The node `defenum` produces — a named, closed set of string values. A PURE construct:
// like a record's predicate, it contributes one membership predicate `Name?` and no
// constructor (the values are bare strings the predicate validates). This is the SINGLE enum
// AST (the engine `EnumAST` twin was removed).

import { ConstructKind } from "../../core/enums.js";

export type EnumNode = {
  kind: ConstructKind.Enum;
  name: string;
  values: string[];
};
