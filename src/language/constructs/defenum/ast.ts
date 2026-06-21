// The node `defenum` produces — a named, closed set of string values. A PURE construct:
// like a record's predicate, it contributes one membership predicate `Name?` and no
// constructor (the values are bare strings the predicate validates).
//
// SINGLE SOURCE OF TRUTH: the enum's data shape (name + values) is `EnumDescriptor` in
// core/types.ts; EnumNode is that descriptor plus the construct discriminant.

import type { EnumDescriptor } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type EnumNode = EnumDescriptor & { kind: ConstructKind.Enum };
