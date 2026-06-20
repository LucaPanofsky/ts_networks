// The node `defrecord` produces — "what we expect back". A named sort with typed fields.

import type { TypeRef } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type FieldDecl = {
  name: string;
  type: TypeRef;
};

export type RecordNode = {
  kind: ConstructKind.Record;
  name: string;
  fields: FieldDecl[];
};
